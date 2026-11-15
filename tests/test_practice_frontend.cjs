const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const core=require('../static/practice_core.js');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(){
 const els=new Map(),requests=[],posts=[];
 const element=id=>({id,value:'',textContent:'',checked:false,disabled:false,hidden:false,style:{},children:[],width:100,height:100,
   append(...items){this.children.push(...items)},replaceChildren(...items){this.children=[...items]},setAttribute(){},scrollIntoView(){},focus(){},
   getContext(){return {clearRect(){},drawImage(){},fillRect(){},strokeRect(){}}},getBoundingClientRect(){return {left:0,top:0,width:100,height:100}},setPointerCapture(){},
   toBlob(fn){fn({syntheticCrop:true})},toDataURL(){return 'data:image/png;base64,c3ludGhldGlj'},reset(){for(const x of ['title','choices','parts','answer','explanation'])el(x).value='';el('reviewed').checked=false;}});
 const el=id=>{if(!els.has(id))els.set(id,element(id));return els.get(id);};
 const context=vm.createContext({PracticeCore:core,document:{getElementById:el,createElement:tag=>element(tag)},URL:{createObjectURL:()=>'',revokeObjectURL(){}},Image:class{},console,fetch:async(url,opts)=>{
   if(url.startsWith('/api/practice/ocr'))return new Promise(resolve=>requests.push({url,opts,finish:(text,ok=true)=>resolve({ok,json:async()=>ok?{text}:{error:text}})}));
   let result;if(url==='/api/status')result={ocr:true,languages:['eng']};else if(url==='/api/practice'&&opts?.method==='POST'){posts.push(JSON.parse(opts.body));result={id:'q'};}else if(url==='/api/practice')result=[];else throw Error('Unexpected '+url);
   return {ok:true,json:async()=>result};
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/practice.js'),'utf8'),context);await flush();
 const run=s=>vm.runInContext(s,context);run('photo={width:100,height:100};canvas.width=100;canvas.height=100;');
 const crop=(x=5,y=5,w=20,h=20)=>{el('canvas').onpointerdown({clientX:x,clientY:y,pointerId:1});el('canvas').onpointermove({clientX:x+w,clientY:y+h});el('canvas').onpointerup();};
 return {el,run,crop,requests,posts};
}
test('no default full-page submission; explicit bounded crop required',async()=>{const h=await setup();await h.el('ocr').onclick();h.crop(0,0,100,100);await h.el('ocr').onclick();assert.equal(h.requests.length,0);h.crop();const pending=h.el('ocr').onclick();await flush();assert.equal(h.requests.length,1);assert.equal(h.requests[0].opts.headers['Content-Type'],'application/octet-stream');assert.equal(h.requests[0].opts.body.syntheticCrop,true);h.requests[0].finish('text');await pending;});
test('crop changes invalidate delayed OCR without clearing curated blocks',async()=>{const h=await setup();h.run("addBlock('text','curated')");h.crop();const old=h.el('ocr').onclick();await flush();h.crop(50,50);h.requests[0].finish('stale');await old;assert.equal(h.run('blocks.length'),1);assert.equal(h.run('blocks[0].text'),'curated');});
test('manual draft edits invalidate OCR completion',async()=>{const h=await setup();h.crop();const old=h.el('ocr').onclick();await flush();h.el('title').value='manual';h.el('title').oninput();h.requests[0].finish('stale');await old;assert.equal(h.run('blocks.length'),0);});
test('new question invalidates pending OCR and clears temporary photo',async()=>{const h=await setup();h.crop();const old=h.el('ocr').onclick();await flush();h.el('new').onclick();h.requests[0].finish('stale');await old;assert.equal(h.run('blocks.length'),0);assert.equal(h.run('photo'),null);});
test('diagram requires confirmation; changing crop resets confirmation',async()=>{const h=await setup();h.crop();h.el('figure').onclick();assert.equal(h.run('blocks.length'),0);h.el('figure-approved').checked=true;h.crop(50,50);assert.equal(h.el('figure-approved').checked,false);h.el('figure-approved').checked=true;h.el('figure').onclick();assert.equal(h.run('blocks[0].type'),'image');assert.equal(h.run('blocks[0].approved'),true);});
test('preview excludes answer and save includes separate answer only after review',async()=>{const h=await setup();h.run("addBlock('text','question')");h.el('answer').value='secret';h.el('preview').onclick();assert.equal(h.el('reviewed').disabled,false);assert.ok(!JSON.stringify(h.el('preview-content').children).includes('secret'));await h.el('form').onsubmit({preventDefault(){}});assert.equal(h.posts.length,0);h.el('reviewed').checked=true;await h.el('form').onsubmit({preventDefault(){}});assert.equal(h.posts.length,1);assert.equal(h.posts[0].answer,'secret');assert.equal('paper_id' in h.posts[0],false);assert.equal(h.run('photo'),null);});
test('draft edits invalidate preview confirmation',async()=>{const h=await setup();h.run("addBlock('latex','x^2')");h.el('preview').onclick();h.el('reviewed').checked=true;h.el('parts').value='part';h.el('parts').oninput();assert.equal(h.el('reviewed').checked,false);assert.equal(h.el('reviewed').disabled,true);});
test('a stale OCR error cannot re-enable a newer pending request',async()=>{const h=await setup();h.crop();const old=h.el('ocr').onclick();await flush();h.crop(50,50);const fresh=h.el('ocr').onclick();await flush();h.requests[0].finish('old error',false);await old;assert.equal(h.el('ocr').disabled,true);h.requests[1].finish('new');await fresh;assert.equal(h.run('blocks[0].text'),'new');assert.equal(h.el('ocr').disabled,false);});
test('sample intent immediately invalidates OCR even before sample fetch resolves',async()=>{const h=await setup();h.crop();const old=h.el('ocr').onclick();await flush();await h.el('sample').onclick();h.requests[0].finish('stale');await old;assert.equal(h.run('blocks.length'),0);});
test('photo controls disabled during save and newly selected photo is not cleared',async()=>{const h=await setup();h.run("addBlock('text','q')");h.el('preview').onclick();h.el('reviewed').checked=true;const done=h.el('form').onsubmit({preventDefault(){}});assert.equal(h.el('file').disabled,true);assert.equal(h.el('sample').disabled,true);h.run('photoEpoch++; photo={width:50,height:50}');await done;assert.equal(h.run('photo.width'),50);assert.equal(h.el('file').disabled,false);});
