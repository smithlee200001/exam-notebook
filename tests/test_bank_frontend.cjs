const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function setup() {
  const elements = new Map(), requests = [], objectURLs = new Map(), revoked = [];
  let nextURL = 0, confirmResult = true;
  function element(tag) {
    let id = '';
    return {tag, value:'', textContent:'', children:[], style:{}, files:[], checked:false, disabled:false,
      classList:{toggle(){}},
      get id(){return id;}, set id(value){id=value;elements.set(value,this);},
      append(...children){this.children.push(...children);},
      setAttribute(name,value){this[name]=value;},
      replaceChildren(...children){this.children=children;}, removeAttribute(name){delete this[name];}
    };
  }
  const el = id => {if(!elements.has(id))elements.set(id,element(id));return elements.get(id);};
  const context = vm.createContext({
    document:{getElementById:el,querySelectorAll:()=>[],createElement:element,createElementNS:(ns,tag)=>element(tag),createTextNode:text=>({textContent:text})},
    confirm:()=>confirmResult, console,
    URL:{
      createObjectURL(file){const url='blob:mock-'+ ++nextURL;objectURLs.set(url,file);return url;},
      revokeObjectURL(url){assert.ok(objectURLs.delete(url));revoked.push(url);}
    },
    Image:class{
      async decode(){
        const file=objectURLs.get(this.src);
        if(file.deferDecode)await file.deferDecode;
        if(file.broken)throw Error('decode error');
        this.naturalWidth=file.width??100;this.naturalHeight=file.height??200;
      }
    },
    fetch:async(url,options)=>{
      if(options?.method === 'POST')return new Promise(resolve=>requests.push({url,body:options.body,
        finish:(data,ok=true)=>resolve({ok,json:async()=>data})}));
      return {ok:true,json:async()=>url==='/api/status'?{message:'offline'}:[]};
    }
  });
  const run = code => vm.runInContext(code,context);
  run(fs.readFileSync(path.join(__dirname,'../static/geometry.js'),'utf8'));
  run(fs.readFileSync(path.join(__dirname,'../static/demo.js'),'utf8'));
  run(fs.readFileSync(path.join(__dirname,'../static/bank.js'),'utf8'));await flush();
  const all = root => [root,...root.children.flatMap(child=>child.children?all(child):[child])];
  const find = text => all(el('editor')).find(e=>e.tag==='button'&&e.textContent===text);
  const pick = file => {el('file').files=file?[file]:[];el('file').value=file?.name??'';return el('file').onchange();};
  return {el,run,requests,find,all,pick,objectURLs,revoked,setConfirm(value){confirmResult=value;}};
}
const image = (name,options={}) => ({name,size:100,type:'image/png',...options});

test('saving freezes draft and source, prevents duplicate writes, and unlocks after failure',async()=>{
  const h=await setup();h.el('demo').onclick();h.el('draft-reviewed').checked=true;
  const save=h.find('保存这一题到题库'), pending=save.onclick();
  assert.equal(h.requests.length,1);assert.equal(h.el('editor').inert,true);
  assert.equal(h.el('file').disabled,true);assert.equal(h.el('source').disabled,true);
  await save.onclick();assert.equal(h.requests.length,1);
  const original=h.run('drafts.length');h.el('manual').onclick();assert.equal(h.run('drafts.length'),original);
  h.requests[0].finish({error:'save failed'},false);await pending;
  assert.equal(h.el('editor').inert,false);assert.equal(h.el('file').disabled,false);
  assert.equal(h.el('message').textContent,'save failed');assert.equal(h.run('drafts[0].saved'),undefined);
});

test('changed content must be previewed and reviewed before saving',async()=>{
  const h=await setup();h.el('demo').onclick();h.el('draft-reviewed').checked=true;
  const input=h.all(h.el('editor')).find(e=>e.tag==='textarea');input.value='修改题干';input.oninput();
  assert.equal(h.el('draft-reviewed').disabled,true);assert.equal(h.el('draft-reviewed').checked,false);
  await h.find('保存这一题到题库').onclick();assert.equal(h.requests.length,0);
  h.find('更新题面预览').onclick();assert.equal(h.el('draft-reviewed').disabled,false);
  h.el('draft-reviewed').checked=true;const pending=h.find('保存这一题到题库').onclick();
  assert.equal(JSON.parse(h.requests[0].body).question.blocks[0].text,'修改题干');
  h.requests[0].finish({number:'Q000001'});await pending;
  assert.equal(h.run('drafts[0].saved'),'Q000001');
});

test('extraction holds draft controls and restores them on CLI failure',async()=>{
  const h=await setup();await h.pick(image('a.png'));const pending=h.el('extract').onclick();
  assert.equal(h.el('manual').disabled,true);assert.equal(h.el('editor').inert,true);
  h.el('manual').onclick();assert.equal(h.run('drafts.length'),0);
  h.requests[0].finish({error:'CLI timeout'},false);await pending;
  assert.equal(h.el('extract').disabled,false);assert.equal(h.el('editor').inert,false);
  assert.equal(h.el('message').textContent,'CLI timeout');
});

for(const [label,options,expected] of [
  ['oversize bytes',{size:4*1024*1024+1},'4 MB'],
  ['wrong type',{type:'image/gif'},'PNG、JPEG 或 WebP'],
  ['decode error',{broken:true},'无法读取图片'],
  ['oversize pixels',{width:4000,height:2500},'800 万像素'],
])test('invalid replacement ('+label+') disables OCR and preserves drafts',async()=>{
  const h=await setup();await h.pick(image('a.png'));h.el('manual').onclick();
  h.run("drafts[0].blocks[0].text='keep this draft'");
  h.el('source').value='edited source';
  const oldURL=h.el('source-image').src;
  await h.pick(image('b.png',options));
  assert.equal(h.el('source-image').hidden,true);
  assert.equal(h.el('source-image').src,undefined);
  assert.equal(h.el('source-empty').hidden,false);
  assert.equal(h.el('pending-image').textContent,'未选择待识别图片');
  assert.equal(h.el('extract').disabled,true);
  assert.equal(h.el('file').value,'');
  assert.match(h.el('message').textContent,new RegExp(expected));
  assert.equal(h.objectURLs.size,0);
  assert.ok(h.revoked.includes(oldURL));
  assert.equal(h.run('drafts[0].blocks[0].text'),'keep this draft');
  assert.equal(h.el('source').value,'edited source');
  await h.el('extract').onclick();assert.equal(h.requests.length,0);
  assert.throws(()=>h.run('crop({box:[0,0,1000,1000]})'),/请先选择对应原图/);
});

test('switching to the offline demo drops the old upload and preview',async()=>{
  const h=await setup();await h.pick(image('a.png'));const oldURL=h.el('source-image').src;
  h.el('demo').onclick();
  assert.equal(h.el('pending-image').textContent,'未选择待识别图片');
  assert.equal(h.el('source-image').hidden,true);
  assert.equal(h.el('extract').disabled,true);
  assert.deepEqual(h.revoked,[oldURL]);
  assert.equal(h.run('drafts.length'),3);
  await h.el('extract').onclick();assert.equal(h.requests.length,0);
});

test('a valid replacement can only send the newly selected file',async()=>{
  const h=await setup();const a=image('a.png');await h.pick(a);
  let finishDecode;const b=image('b.png',{deferDecode:new Promise(resolve=>finishDecode=resolve)});
  const choosing=h.pick(b);
  assert.equal(h.el('extract').disabled,true);
  assert.equal(h.el('source-image').src,undefined);
  await h.el('extract').onclick();assert.equal(h.requests.length,0);
  finishDecode();await choosing;
  assert.equal(h.el('pending-image').textContent,'待识别图片：b.png');
  assert.equal(h.el('extract').disabled,false);
  const pending=h.el('extract').onclick();
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].url,'/api/bank/extract');
  assert.equal(h.requests[0].body,b);
  h.requests[0].finish({questions:[]});await pending;
});

test('declining a replacement preserves the draft without restoring the old upload',async()=>{
  const h=await setup();await h.pick(image('a.png'));h.el('manual').onclick();h.setConfirm(false);
  await h.pick(image('b.png'));
  assert.equal(h.run('drafts.length'),1);
  assert.equal(h.el('extract').disabled,true);
  assert.equal(h.objectURLs.size,0);
  await h.el('extract').onclick();assert.equal(h.requests.length,0);
});

test('worksheet request preserves selected order and answer space',async()=>{
  const h=await setup();h.run("selection=[{id:12,lines:6},{id:3,lines:0}]");
  h.el('worksheet-title').value='练习卷';const pending=h.el('compose').onclick();
  assert.deepEqual(JSON.parse(h.requests[0].body),{title:'练习卷',items:[{id:12,lines:6},{id:3,lines:0}]});
  h.requests[0].finish({error:'offline'},false);await pending;
  assert.equal(h.el('compose').disabled,false);
});


test('geometry demos render SVG and reset edited drafts',async()=>{
  const h=await setup();h.el('demo').onclick();
  const qs=JSON.parse(h.run('JSON.stringify(drafts)'));
  assert.equal(qs.length,3);
  for(const q of qs){assert.ok(q.blocks.some(b=>b.type==='latex'));assert.ok(q.blocks.some(b=>b.type==='geometry'));assert.equal(q.parts.length,2);}
  assert.ok(h.all(h.el('editor')).some(e=>e.tag==='svg'));
  h.run("drafts[0].blocks[0].text='edited';drafts[0].saved='Q000001'");
  h.el('demo').onclick();
  assert.notEqual(h.run('drafts[0].blocks[0].text'),'edited');
  assert.equal(h.run('drafts[0].saved'),undefined);
  assert.equal(h.requests.length,0);
});

test('geometry JSON edits require a valid preview and repeated edits save the latest coordinates',async()=>{
  const h=await setup();h.el('demo').onclick();
  const input=h.all(h.el('editor')).find(e=>e.className==='geometry-editor');
  const original=JSON.parse(input.value);
  input.value='{broken';input.oninput();h.find('更新题面预览').onclick();
  assert.equal(h.el('draft-reviewed').disabled,true);
  h.el('draft-reviewed').checked=true;await h.find('保存这一题到题库').onclick();assert.equal(h.requests.length,0);
  original.points.B.x=650;input.value=JSON.stringify(original);input.oninput();h.find('更新题面预览').onclick();
  assert.equal(h.el('draft-reviewed').disabled,false);
  original.points.B.x=660;input.value=JSON.stringify(original);input.oninput();h.find('更新题面预览').onclick();
  h.el('draft-reviewed').checked=true;const pending=h.find('保存这一题到题库').onclick();
  const q=JSON.parse(h.requests[0].body).question;
  assert.equal(q.blocks.find(b=>b.type==='geometry').points.B.x,660);
  assert.equal(q.blocks.find(b=>b.type==='geometry').data,undefined);
  h.requests[0].finish({number:'Q000001'});await pending;
});

test('width slider previews live, clears review and saves the latest percentage',async()=>{
  const h=await setup();h.el('demo').onclick();
  const slider=h.all(h.el('editor')).find(e=>e.type==='range');
  assert.equal(Number(slider.value),60);
  h.el('draft-reviewed').checked=true;
  slider.value='35';slider.oninput();
  assert.equal(h.el('draft-reviewed').checked,false);
  assert.equal(h.el('draft-reviewed').disabled,false);
  assert.ok(h.all(h.el('editor')).filter(e=>e.tag==='svg').every(e=>e.style==='width:35%'));
  const input=h.all(h.el('editor')).find(e=>e.className==='geometry-editor');
  assert.equal(JSON.parse(input.value).display.widthPercent,35);
  slider.value='80';slider.oninput();
  h.el('draft-reviewed').checked=true;
  const pending=h.find('保存这一题到题库').onclick();
  assert.equal(JSON.parse(h.requests[0].body).question.blocks.find(b=>b.type==='geometry').display.widthPercent,80);
  h.requests[0].finish({number:'Q000001'});await pending;
});

test('slider does not discard invalid JSON edits',async()=>{
  const h=await setup();h.el('demo').onclick();
  const input=h.all(h.el('editor')).find(e=>e.className==='geometry-editor');
  const slider=h.all(h.el('editor')).find(e=>e.type==='range');
  input.value='{invalid';input.oninput();slider.value='40';slider.oninput();
  assert.equal(input.value,'{invalid');assert.equal(Number(slider.value),60);
  assert.equal(h.el('draft-reviewed').disabled,true);assert.equal(h.requests.length,0);
});
