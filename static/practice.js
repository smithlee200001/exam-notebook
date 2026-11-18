'use strict';
const $ = id => document.getElementById(id);
const { RequestGate, lines } = PracticeCore;
const gate = new RequestGate();
let photo = null, photoEpoch = 0, box = null, drag = null, blocks = [], pending = false, saving = false, draftRevision = 0;
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const tell = text => { $('message').textContent = text; };
async function api(url, options) {
  const r = await fetch(url, options); const data = await r.json();
  if (!r.ok) throw Error(data.error || '请求失败'); return data;
}
function changed() {
  gate.invalidate(); pending = false; draftRevision++; $('reviewed').checked = false;
  $('reviewed').disabled = true; $('preview-panel').hidden = true; sync();
}
function validBox() { return photo && box && box[2] >= 5 && box[3] >= 5 && (box[2] < photo.width || box[3] < photo.height); }
function sync() { $('ocr').disabled = !validBox() || pending || saving; $('figure').disabled = !validBox() || saving; $('save').disabled = saving; $('file').disabled = saving; $('sample').disabled = saving; $('forget').disabled = saving; $('new').disabled = saving; }
function draw() {
  if (!photo) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(photo, 0, 0);
  if (box) { const [x,y,w,h] = box; ctx.fillStyle = '#4b896b22'; ctx.fillRect(x,y,w,h); ctx.strokeStyle = '#cc7434'; ctx.lineWidth = Math.max(2,canvas.width/300); ctx.strokeRect(x,y,w,h); }
  $('coords').textContent = box ? `选区：${box[2]} × ${box[3]} 像素` : '请拖动框选一道题（不发送整页）'; sync();
}
function forget() {
  photoEpoch++; photo = null; box = null; drag = null; gate.invalidate(); pending = false;
  canvas.width = 1; canvas.height = 1; canvas.style.display = 'none'; $('empty').hidden = false;
  $('file').value = ''; $('figure-approved').checked = false; $('coords').textContent = '临时照片已关闭（已校对草稿仍保留）'; sync();
}
async function openPhoto(blob) {
  if (saving) return;
  if (blob.size > 12 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(blob.type)) throw Error('请选择不超过 12 MB 的 PNG/JPEG/WebP');
  forget(); const epoch = photoEpoch; const url = URL.createObjectURL(blob); const im = new Image();
  try {
    await new Promise((resolve,reject) => { im.onload = resolve; im.onerror = () => reject(Error('无法打开图片')); im.src = url; });
    if (epoch !== photoEpoch) return;
    if (im.width * im.height > 24_000_000) throw Error('图片超过 2400 万像素');
    photo = im; canvas.width = im.width; canvas.height = im.height; canvas.style.display = 'block'; $('empty').hidden = true; draw();
    tell('照片仅在浏览器临时打开。请框选题目或图表。');
  } finally { URL.revokeObjectURL(url); }
}
function point(e) { const r = canvas.getBoundingClientRect(); return [Math.max(0,Math.min(canvas.width,Math.round((e.clientX-r.left)*canvas.width/r.width))),Math.max(0,Math.min(canvas.height,Math.round((e.clientY-r.top)*canvas.height/r.height)))]; }
canvas.onpointerdown = e => { if (!photo || saving) return; gate.invalidate(); pending = false; drag = point(e); box = null; $('figure-approved').checked = false; canvas.setPointerCapture(e.pointerId); draw(); };
canvas.onpointermove = e => { if (!drag) return; const p = point(e); box = [Math.min(drag[0],p[0]),Math.min(drag[1],p[1]),Math.abs(p[0]-drag[0]),Math.abs(p[1]-drag[1])]; draw(); };
canvas.onpointerup = () => { drag = null; sync(); };
canvas.onpointercancel = () => { drag = null; box = null; draw(); };
function crop() {
  if (!validBox() || drag) throw Error('请先框选一个有效局部区域');
  const [x,y,w,h] = box; const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(photo,x,y,w,h,0,0,w,h); return c;
}
function button(label, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = action; return b; }
function renderBlocks() {
  $('blocks').replaceChildren();
  blocks.forEach((block,i) => {
    const row = document.createElement('div'); row.className = 'block-editor';
    const tools = document.createElement('div'); tools.className = 'block-tools';
    const label = document.createElement('strong'); label.textContent = `${i+1}. ${block.type === 'latex' ? 'LaTeX 公式' : block.type === 'image' ? '已确认图表' : '文字'}`; tools.append(label);
    for (const [name,delta] of [['↑',-1],['↓',1]]) { const b=button(name,()=>{[blocks[i],blocks[i+delta]]=[blocks[i+delta],blocks[i]];changed();renderBlocks();});b.disabled=i+delta<0||i+delta>=blocks.length; b.setAttribute('aria-label',`移动第 ${i+1} 块${delta<0?'向上':'向下'}`);tools.append(b); }
    tools.append(button('移除',()=>{blocks.splice(i,1);changed();renderBlocks();})); row.append(tools);
    if (block.type === 'image') { const im=document.createElement('img'); im.src=block.data; im.alt=block.alt; row.append(im); const p=document.createElement('p');p.textContent=block.alt;row.append(p); }
    else { const t=document.createElement('textarea');t.value=block.text;t.setAttribute('aria-label',`第 ${i+1} 块${block.type==='latex'?'公式':'文字'}`);t.oninput=()=>{block.text=t.value;changed();};row.append(t); }
    $('blocks').append(row);
  });
}
function addBlock(type,text='') { blocks.push({type,text});changed();renderBlocks(); }
function data() { return {title:$('title').value.trim() || '未命名练习题',blocks:blocks.map(b=>({...b})),choices:lines($('choices').value),parts:lines($('parts').value),answer:$('answer').value,explanation:$('explanation').value,reviewed:$('reviewed').checked}; }
function exercise(q,target) {
  target.replaceChildren(); const h=document.createElement('h3');h.textContent=q.title;target.append(h);
  for (const b of q.blocks) {
    if (b.type==='image') { const im=document.createElement('img');im.src=b.data || '/api/practice/assets/'+encodeURIComponent(b.asset_id);im.alt=b.alt;target.append(im); }
    else { const p=document.createElement(b.type==='latex'?'pre':'p');p.className=b.type==='latex'?'formula':'question-text';p.textContent=b.text;if(b.type==='latex' && typeof katex!=='undefined'){katex.render(b.text,p,{output:'mathml',trust:false,strict:'error',throwOnError:false,displayMode:true,maxExpand:200,maxSize:10});}target.append(p); }
  }
  for (const [label,items] of [['选项',q.choices],['小问',q.parts]]) { if (!items.length) continue;const h=document.createElement('h4');h.textContent=label;target.append(h);const ul=document.createElement('ul');items.forEach(s=>{const li=document.createElement('li');li.textContent=s;ul.append(li);});target.append(ul); }
}
async function refresh() {
  const qs=await api('/api/practice');$('count').textContent=qs.length;$('cards').replaceChildren();
  qs.forEach(q=>{const card=document.createElement('article');card.className='card';exercise(q,card);const work=document.createElement('textarea');work.placeholder='在这里重做（不保存）';work.setAttribute('aria-label','本次作答，不保存');card.append(work);const answer=document.createElement('div');answer.hidden=true;let answerEpoch=0;
    const reveal=button('查看答案',async()=>{const epoch=++answerEpoch;try{const a=await api('/api/practice/'+encodeURIComponent(q.id)+'/answer');if(epoch!==answerEpoch)return;answer.replaceChildren();const p=document.createElement('p');p.textContent='答案：'+(a.answer||'未录入')+'\n解析：'+(a.explanation||'未录入');answer.append(p);answer.hidden=false;}catch(e){tell(e.message);}});
    card.append(reveal,button('重新练习',()=>{answerEpoch++;work.value='';answer.replaceChildren();answer.hidden=true;work.focus();}),answer);$('cards').append(card);
  });
}
$('file').onchange=()=>{const f=$('file').files[0];if(f)openPhoto(f).catch(e=>tell(e.message));};
$('sample').onclick=async()=>{if(saving)return;gate.invalidate();pending=false;sync();const epoch=++photoEpoch;try{const r=await fetch('/api/practice/sample');if(!r.ok)throw Error('演示图加载失败');const b=await r.blob();if(epoch===photoEpoch)await openPhoto(b);}catch(e){tell(e.message);}};
$('forget').onclick=forget;
$('new').onclick=()=>{if(saving)return;forget();blocks=[];$('form').reset();changed();renderBlocks();tell('已开始新题，未保存草稿已清空。');};
$('add-text').onclick=()=>addBlock('text');$('add-latex').onclick=()=>addBlock('latex');
for(const id of ['title','choices','parts','answer','explanation'])$(''+id).oninput=changed;
$('lang').onchange=()=>{gate.invalidate();pending=false;sync();};
$('ocr').onclick=async()=>{
  let current;
  try { const c=crop();current=gate.begin();pending=true;sync();const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!current())return;if(!blob)throw Error('无法读取选区');const r=await api('/api/practice/ocr?lang='+encodeURIComponent($('lang').value),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob});if(!current())return;addBlock('text',r.text);tell('识别文字已添加。请删除旧答案、批注和身份信息，逐字核对。');}
  catch(e){if(!current||current())tell(e.message);}finally{if(current&&current()){pending=false;sync();}}
};
$('figure').onclick=()=>{try{if(!$('figure-approved').checked)throw Error('请先确认图表不含旧答案、批注或个人信息');const c=crop();blocks.push({type:'image',data:c.toDataURL('image/png'),alt:$('figure-alt').value.trim()||'题目图表',approved:true});changed();renderBlocks();$('figure-approved').checked=false;tell('图表加入草稿；保存题目时才持久化。');}catch(e){tell(e.message);}};
$('preview').onclick=()=>{const q=data();if(!q.blocks.length){tell('请先添加题面');return;}exercise(q,$('preview-content'));$('preview-panel').hidden=false;$('reviewed').disabled=false;$('preview-panel').scrollIntoView({behavior:'smooth',block:'start'});};
$('form').onsubmit=async e=>{e.preventDefault();if(saving)return;if(!$('reviewed').checked){tell('请预览并确认题面后保存');return;}const q=data(),revision=draftRevision,savedPhotoEpoch=photoEpoch;saving=true;gate.invalidate();pending=false;sync();try{await api('/api/practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(q)});if(revision===draftRevision){blocks=[];$('form').reset();if(savedPhotoEpoch===photoEpoch)forget();changed();renderBlocks();}try{await refresh();tell('练习题已保存，可脱离原图重做。');}catch(err){tell('练习题已保存，但列表刷新失败。请刷新页面，不要重复保存。');}}catch(err){tell(err.message);}finally{saving=false;sync();}};
$('legacy-load').onclick=async()=>{try{const qs=await api('/api/questions');$('legacy-cards').replaceChildren();for(const q of qs){const p=document.createElement('p');p.className='question-text';p.textContent=q.payload.stem;$('legacy-cards').append(p);}if(!qs.length)$('legacy-cards').textContent='没有旧版记录';}catch(e){tell(e.message);}};
api('/api/status').then(s=>{$('status').textContent=s.message || (s.ocr?'Codex CLI 已配置 · 选区发送给 OpenAI':'Codex CLI 未配置，可手工录入');}).catch(()=>{$('status').textContent='OCR 状态暂不可用';});
refresh().catch(e=>tell(e.message));renderBlocks();sync();
