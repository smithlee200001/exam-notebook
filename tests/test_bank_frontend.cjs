const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function setup() {
  const elements = new Map(), requests = [];
  function element(tag) {
    let id = '';
    return {tag, value:'', textContent:'', children:[], style:{}, checked:false, disabled:false,
      classList:{toggle(){}},
      get id(){return id;}, set id(value){id=value;elements.set(value,this);},
      append(...children){this.children.push(...children);},
      replaceChildren(...children){this.children=children;}, removeAttribute(name){delete this[name];}
    };
  }
  const el = id => {if(!elements.has(id))elements.set(id,element(id));return elements.get(id);};
  const context = vm.createContext({
    document:{getElementById:el,querySelectorAll:()=>[],createElement:element,createTextNode:text=>({textContent:text})},
    confirm:()=>true, console, URL, Image:class{},
    fetch:async(url,options)=>{
      if(options?.method === 'POST')return new Promise(resolve=>requests.push({url,body:options.body,
        finish:(data,ok=true)=>resolve({ok,json:async()=>data})}));
      return {ok:true,json:async()=>url==='/api/status'?{message:'offline'}:[]};
    }
  });
  const run = code => vm.runInContext(code,context);
  run(fs.readFileSync(path.join(__dirname,'../static/bank.js'),'utf8'));await flush();
  const all = root => [root,...root.children.flatMap(child=>child.children?all(child):[child])];
  const find = text => all(el('editor')).find(e=>e.tag==='button'&&e.textContent===text);
  return {el,run,requests,find,all};
}

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
  const h=await setup();h.run('imageFile={synthetic:true}');const pending=h.el('extract').onclick();
  assert.equal(h.el('manual').disabled,true);assert.equal(h.el('editor').inert,true);
  h.el('manual').onclick();assert.equal(h.run('drafts.length'),0);
  h.requests[0].finish({error:'CLI timeout'},false);await pending;
  assert.equal(h.el('extract').disabled,false);assert.equal(h.el('editor').inert,false);
  assert.equal(h.el('message').textContent,'CLI timeout');
});

test('worksheet request preserves selected order and answer space',async()=>{
  const h=await setup();h.run("selection=[{id:12,lines:6},{id:3,lines:0}]");
  h.el('worksheet-title').value='练习卷';const pending=h.el('compose').onclick();
  assert.deepEqual(JSON.parse(h.requests[0].body),{title:'练习卷',items:[{id:12,lines:6},{id:3,lines:0}]});
  h.requests[0].finish({error:'offline'},false);await pending;
  assert.equal(h.el('compose').disabled,false);
});
