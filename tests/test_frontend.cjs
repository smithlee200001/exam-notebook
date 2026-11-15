const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(process.env.APP_JS||path.join(__dirname,'../static/app.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){
  const elements=new Map(),requests=[],saved=[];
  const el=id=>{
    if(!elements.has(id))elements.set(id,{
      value:'',textContent:'',checked:false,disabled:false,style:{},children:[],
      append(x){this.children.push(x)},replaceChildren(){this.children=[]},
      getContext(){return {clearRect(){},drawImage(){},fillRect(){},strokeRect(){}}},
      getBoundingClientRect(){return {left:0,top:0,width:100,height:100}},
      setPointerCapture(){},reset(){for(const f of ['stem','student_answer','correct_answer','analysis','tags','reason','grading'])el(f).value='';el('reviewed').checked=false}
    });
    return elements.get(id);
  };
  const p={id:'synthetic',source:'synthetic',width:100,height:100,image:'synthetic.png'};
  class Image {set src(x){queueMicrotask(()=>this.onload?.())}}
  const context=vm.createContext({
    document:{getElementById:el,createElement:()=>({append(){}})},
    Image,window:{scrollTo(){}},
    fetch:async(url,options)=>{
      let result;
      if(url==='/api/status')result={ocr:true,languages:['eng']};
      else if(url==='/api/papers')result=[p];
      else if(url==='/api/ocr')return new Promise(resolve=>requests.push({
        payload:JSON.parse(options.body),
        finish(text,ok=true){resolve({ok,json:async()=>ok?{text,engine:'synthetic test'}:{error:text}})}
      }));
      else if(url==='/api/questions'&&options?.method==='POST'){
        saved.push(JSON.parse(options.body));result={};
      }else if(url==='/api/questions')result=[];
      else throw Error('Unexpected request '+url);
      return {ok:true,json:async()=>result};
    }
  });
  vm.runInContext(source,context);await flush();
  const crop=(x,y,w,h)=>{
    el('canvas').onpointerdown({clientX:x,clientY:y,pointerId:1});
    el('canvas').onpointermove({clientX:x+w,clientY:y+h});
    el('canvas').onpointerup({});
  };
  return {el,requests,saved,crop,run:code=>vm.runInContext(code,context)};
}
test('delayed OCR cannot attach A text to B; current B saves/reopens B coordinates',async()=>{
  const h=await setup();h.crop(5,5,25,25);
  const old=h.el('ocr').onclick();h.crop(60,60,30,30);
  h.requests[0].finish('A text');await old;
  assert.equal(h.el('stem').value,'');
  const fresh=h.el('ocr').onclick();h.requests[1].finish('B text');await fresh;
  assert.equal(h.el('stem').value,'B text');
  h.el('reviewed').checked=true;h.el('form').onsubmit({preventDefault(){}});await flush();
  assert.equal(h.saved[0].stem,'B text');assert.deepEqual(h.saved[0].region,[60,60,30,30]);
  await h.run('select(paper,'+JSON.stringify(h.saved[0].region)+')');await flush();
  assert.equal(h.run('JSON.stringify(region)'),JSON.stringify(h.saved[0].region));
});
test('completed OCR and other draft fields cleared when crop changes',async()=>{
  const h=await setup();h.crop(5,5,25,25);const task=h.el('ocr').onclick();
  h.requests[0].finish('A text');await task;
  h.el('student_answer').value='A answer';h.el('reviewed').checked=true;
  h.crop(60,60,30,30);
  assert.equal(h.el('stem').value,'');assert.equal(h.el('student_answer').value,'');
  assert.equal(h.el('reviewed').checked,false);
});
test('A to B to A still invalidates old response',async()=>{
  const h=await setup();h.crop(5,5,25,25);const task=h.el('ocr').onclick();
  h.crop(60,60,30,30);h.crop(5,5,25,25);
  h.requests[0].finish('outdated');await task;assert.equal(h.el('stem').value,'');
});
for(const staleError of [false,true])test('stale completion error='+staleError+' cannot affect newer pending request',async()=>{
  const h=await setup();h.crop(5,5,25,25);const old=h.el('ocr').onclick();
  h.crop(60,60,30,30);const fresh=h.el('ocr').onclick();
  h.el('message').textContent='new request pending';
  h.requests[0].finish('obsolete',!staleError);await old;
  assert.equal(h.el('ocr').disabled,true);assert.equal(h.el('message').textContent,'new request pending');
  h.requests[1].finish('current');await fresh;
  assert.equal(h.el('stem').value,'current');assert.equal(h.el('ocr').disabled,false);
});
test('older completion cannot overwrite newer completed result',async()=>{
  const h=await setup();const old=h.el('ocr').onclick();const fresh=h.el('mock').onclick();
  h.requests[1].finish('new');await fresh;h.requests[0].finish('old');await old;
  assert.equal(h.el('stem').value,'new');
});
test('manual editing during request is preserved',async()=>{
  const h=await setup();const task=h.el('ocr').onclick();
  h.el('stem').value='manually corrected';h.el('form').oninput();
  h.requests[0].finish('old');await task;assert.equal(h.el('stem').value,'manually corrected');
});
test('reset invalidates OCR; click without crop change preserves draft',async()=>{
  const h=await setup();h.crop(5,5,25,25);const task=h.el('ocr').onclick();
  h.el('reset').onclick();h.requests[0].finish('old');await task;
  assert.equal(h.el('stem').value,'');h.el('stem').value='keep me';
  h.el('canvas').onpointerdown({clientX:1,clientY:1,pointerId:1});h.el('canvas').onpointerup({});
  assert.equal(h.el('stem').value,'keep me');
});
test('selecting paper again invalidates request',async()=>{
  const h=await setup();const task=h.el('ocr').onclick();
  await h.run('select(paper)');await flush();h.requests[0].finish('old');await task;
  assert.equal(h.el('stem').value,'');
});
