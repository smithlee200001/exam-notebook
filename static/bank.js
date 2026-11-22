/* Model and user text is rendered as text nodes; only KaTeX creates math markup. */
'use strict';
const $ = id => document.getElementById(id);
const geometryDrafts = new WeakMap();
const types = ['选择题', '填空题', '计算题', '解答题', '其他'];
let drafts = [], current = 0, questions = [], selection = [], pendingImage = null, generation = 0, busy = false;
const message = text => { $('message').textContent = text; };
function syncImageSelection() {
  const preview = $('source-image');
  if (pendingImage) preview.src = pendingImage.url;
  else preview.removeAttribute('src');
  preview.hidden = !pendingImage;
  $('source-empty').hidden = !!pendingImage;
  $('pending-image').textContent = pendingImage ? '待识别图片：' + pendingImage.file.name : '未选择待识别图片';
  $('extract').disabled = busy || !pendingImage;
}
function clearImageSelection() {
  const previous = pendingImage;
  pendingImage = null;
  $('file').value = '';
  generation++;
  syncImageSelection();
  if (previous) URL.revokeObjectURL(previous.url);
}
function setImportBusy(value) {
  busy = value;
  for (const id of ['file', 'manual', 'demo', 'source']) $(id).disabled = value;
  $('extract').disabled = value || !pendingImage;
  $('editor').inert = value;
  $('draft-nav').inert = value;
}
function node(tag, text, cls) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
function button(text, fn) { const b = node('button', text); b.type = 'button'; b.onclick = fn; return b; }
function field(parent, name, value, change, multiline = false) {
  const label = node('label', name), input = node(multiline ? 'textarea' : 'input');
  input.value = value; input.oninput = () => { change(input.value); const review = $('draft-reviewed'); if (review) { review.checked = false; review.disabled = true; } };
  label.append(input); parent.append(label); return input;
}
function lines(text) { return text.split('\n').map(s => s.trim()).filter(Boolean); }
async function api(url, options = {}) {
  const response = await fetch(url, options); const data = await response.json();
  if (!response.ok) throw Error(data.error || '请求失败'); return data;
}
function post(url, data) { return api(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)}); }
function run(fn) { return async () => { try { await fn(); } catch (e) { message(e.message); } }; }
function tab(name) {
  for (const key of ['import','bank','compose']) $(key+'-tab').hidden = key !== name;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('primary', b.dataset.tab === name));
  if (name === 'compose') renderSelection();
}
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
function math(parent, text, display = false) {
  const span = node(display ? 'div' : 'span', undefined, display ? 'math-display' : '');
  try { katex.render(text, span, {throwOnError:true, trust:false, output:'mathml', displayMode:display, maxExpand:1000}); }
  catch { span.textContent = text; span.title = '公式无法解析，请校对 LaTeX'; }
  parent.append(span);
}
function rich(parent, text) {
  const re = /\\\(([\s\S]*?)\\\)|\$([^$\n]+)\$/g; let pos = 0;
  for (const m of text.matchAll(re)) { parent.append(document.createTextNode(text.slice(pos,m.index))); math(parent,m[1] ?? m[2]); pos=m.index+m[0].length; }
  parent.append(document.createTextNode(text.slice(pos)));
}
function renderQuestion(q, parent) {
  const body = node('div', undefined, 'question-body');
  for (const b of q.blocks) {
    if (b.type === 'geometry') { try { body.append(Geometry.render(b)); } catch(e) {body.append(node('p',e.message,'warning'));} }
    else if (b.type === 'image') { const img = node('img'); img.alt = b.text; const src = b.asset_id ? '/api/bank/assets/'+encodeURIComponent(b.asset_id) : b.data; if(src) img.src=src; body.append(img); }
    else if (b.type === 'latex') math(body,b.text,true);
    else { const p = node('p'); rich(p,b.text); body.append(p); }
  }
  for (const key of ['choices','parts']) for (const text of q[key]) { const p=node('p'); rich(p,text); body.append(p); }
  parent.append(body);
}
function blank() { return {source_number:'', subject:'数学', kind:'计算题', tags:[], blocks:[{type:'text',text:''}], choices:[], parts:[], warnings:[]}; }
function applyGeometryDrafts(q) {
  const blocks=q.blocks.map(b=>{if(b.type!=='geometry')return b;const raw=geometryDrafts.get(b);return Geometry.validate(raw===undefined?b:JSON.parse(raw));});
  blocks.forEach((next,i)=>{const original=q.blocks[i];if(original.type==='geometry'){if(next!==original){for(const key of Object.keys(original))delete original[key];Object.assign(original,next);}geometryDrafts.delete(original);}});
}
function renderDraft() {
  $('draft-count').textContent = drafts.length; $('draft-nav').replaceChildren(); $('editor').replaceChildren();
  drafts.forEach((q,i) => { const b = button(q.saved ? `✓ ${q.saved}` : `题 ${i+1}`, () => {current=i;renderDraft();}); b.classList.toggle('active',i===current); $('draft-nav').append(b); });
  const q = drafts[current]; if (!q) { $('editor').append(node('p','识别后在这里逐题校对。')); return; }
  if (q.saved) { $('editor').append(node('p','已入库：'+q.saved)); renderQuestion(q,$('editor')); return; }
  const editor = $('editor'), geometryControls=[];
  if (q.warnings.length) editor.append(node('p',q.warnings.join('；'),'warning'));
  field(editor,'原卷题号',q.source_number,v=>q.source_number=v);
  field(editor,'学科',q.subject,v=>q.subject=v);
  const label=node('label','题型'), select=node('select');
  types.forEach(t=>{const o=node('option',t);o.value=t;select.append(o);});select.value=q.kind;
  select.onchange=()=>{q.kind=select.value;$('draft-reviewed').checked=false;};label.append(select);editor.append(label);
  field(editor,'知识点（逗号分隔）',q.tags.join('，'),v=>q.tags=v.split(/[,，]/).map(s=>s.trim()).filter(Boolean));
  q.blocks.forEach((b,i)=>{
    const box=node('div',undefined,'block-editor'), tools=node('div',undefined,'block-tools');
    tools.append(node('strong',b.type==='geometry'?'几何图形 · JSON → SVG':b.type==='image'?'图表':b.type==='latex'?'LaTeX 公式':'题面文字'));
    tools.append(button('↑',()=>{if(i){[q.blocks[i-1],q.blocks[i]]=[q.blocks[i],q.blocks[i-1]];renderDraft();}}),button('↓',()=>{if(i<q.blocks.length-1){[q.blocks[i+1],q.blocks[i]]=[q.blocks[i],q.blocks[i+1]];renderDraft();}}),button('移除',()=>{q.blocks.splice(i,1);renderDraft();}));box.append(tools);
    if(b.type==='geometry'){
      box.append(node('p','修改 points 坐标可调整图形，labels 可修改标注。修改后点击「更新题面预览」。坐标变化不会自动修改题目条件。','hint'));
      const sizeLabel=node('label','图形宽度（占题目区域的百分比）','geometry-size'), slider=node('input'), output=node('output');
      slider.type='range';slider.min='20';slider.max='100';slider.step='1';slider.value=b.display?.widthPercent??60;output.textContent=slider.value+'%';
      slider.setAttribute('aria-label','图形宽度百分比');sizeLabel.append(slider,output);box.append(sizeLabel);
      const localPreview=node('div',undefined,'geometry-size-preview');box.append(localPreview);
      const details=node('details');details.append(node('summary','编辑几何 JSON'));box.append(details);
      const input=field(details,'几何 JSON',geometryDrafts.get(b)??JSON.stringify(b,null,2),v=>geometryDrafts.set(b,v),true);input.className='geometry-editor';input.spellcheck=false;
      geometryControls.push({block:b,slider,output,localPreview});
      slider.oninput=()=>{
        const review=$('draft-reviewed');if(review){review.checked=false;review.disabled=true;}
        try{const next=JSON.parse(input.value);next.display={widthPercent:Number(slider.value)};Geometry.validate(next);geometryDrafts.set(b,JSON.stringify(next));input.value=JSON.stringify(next,null,2);updatePreview();}
        catch(e){slider.value=b.display?.widthPercent??60;output.textContent=slider.value+'%';message('请先修正几何 JSON：'+e.message);}
      };
    } else field(box,b.type==='image'?'图表描述':'内容',b.text,v=>b.text=v,true);
    if (b.type === 'image') {
      const img=node('img');if(b.data)img.src=b.data;img.alt=b.text;box.append(img);
      field(box,'裁剪坐标：左、上、右、下（0～1000）',b.box.join(', '),v=>{b.box=v.split(/[,，]/).map(Number); delete b.data; img.removeAttribute('src');});
      box.append(button('根据坐标重新裁剪',run(()=>{crop(b);renderDraft();})));
    }
    editor.append(box);
  });
  const tools=node('div',undefined,'toolbar');
  for(const [type,label] of [['text','＋文字'],['latex','＋公式'],['image','＋图表'],['geometry','＋几何图']]) tools.append(button(label,()=>{q.blocks.push(type==='geometry'?createDemoQuestions()[0].blocks.find(b=>b.type==='geometry'):type==='image'?{type,text:'图表',box:[0,0,1000,1000]}:{type,text:''});renderDraft();}));
  editor.append(tools);
  field(editor,'选项（每行一项，可用 \\(公式\\)）',q.choices.join('\n'),v=>q.choices=lines(v),true);
  field(editor,'小问（每行一问）',q.parts.join('\n'),v=>q.parts=lines(v),true);
  const preview=node('div',undefined,'preview-box');
  const updatePreview=()=>{const review=$('draft-reviewed');try{applyGeometryDrafts(q);for(const control of geometryControls){control.slider.value=control.block.display.widthPercent;control.output.textContent=control.slider.value+'%';control.localPreview.replaceChildren(Geometry.render(control.block));}preview.replaceChildren(node('h3','题面预览'));renderQuestion(q,preview);if(review)review.disabled=false;}catch(e){preview.replaceChildren(node('p',e.message,'warning'));if(review){review.disabled=true;review.checked=false;}message('几何 JSON 无效，请修正后更新预览：'+e.message);}};
  editor.append(button('更新题面预览',updatePreview),preview);
  const checkLabel=node('label',undefined,'check'), check=node('input');check.type='checkbox';check.id='draft-reviewed';
  updatePreview();
  checkLabel.append(check,document.createTextNode('已逐题校对：题面完整，分类、公式及图表正确，不含旧答案或个人信息'));editor.append(checkLabel);
  const save=button('保存这一题到题库',run(async()=>{
    if (busy || q.saved) return;
    if (!check.checked || check.disabled) throw Error('请先更新预览、完成校对并勾选确认');
    applyGeometryDrafts(q);
    setImportBusy(true);save.disabled=true;
    try {const data=await post('/api/bank/questions',{question:q,source:$('source').value,reviewed:true});q.saved=data.number;renderDraft();message('已保存 '+data.number);await loadBank();}
    finally {setImportBusy(false);save.disabled=false;}
  }));save.className='primary';editor.append(save,button('移除这个草稿',()=>{drafts.splice(current,1);current=Math.max(0,current-1);renderDraft();}));
}
function crop(b) {
  const im=$('source-image'), [l,t,r,bt]=b.box;
  if(!pendingImage || !im.complete || !im.naturalWidth) throw Error('请先选择对应原图');
  if(b.box.length!==4 || !b.box.every(Number.isFinite) || !(0<=l&&l<r&&r<=1000&&0<=t&&t<bt&&bt<=1000)) throw Error('裁剪坐标无效');
  const x=Math.floor(l*im.naturalWidth/1000),y=Math.floor(t*im.naturalHeight/1000);
  const w=Math.ceil(r*im.naturalWidth/1000)-x,h=Math.ceil(bt*im.naturalHeight/1000)-y;
  if(w<5||h<5)throw Error('图表区域太小');
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(im,x,y,w,h,0,0,w,h);b.data=canvas.toDataURL('image/png');
}
$('file').onchange=run(async()=>{
  if(busy)return;
  const file=$('file').files[0];
  // 新选择不能继承上一张图的上传权，即使新图验证失败或更换被取消。
  clearImageSelection();
  if(!file){message('未选择待识别图片，已有草稿保留。');return;}
  setImportBusy(true);
  let url;
  try {
    if(file.size>4*1024*1024)throw Error('图片不能超过 4 MB');
    if(file.type && !['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 PNG、JPEG 或 WebP 图片');
    url=URL.createObjectURL(file);
    const probe=new Image();
    probe.src=url;
    try {await probe.decode();} catch {throw Error('无法读取图片');}
    if(!probe.naturalWidth || !probe.naturalHeight)throw Error('无法读取图片');
    if(probe.naturalWidth*probe.naturalHeight>8000000)throw Error('图片不能超过 800 万像素');
    if(drafts.some(q=>!q.saved) && !confirm('更换图片会清除尚未保存的题目草稿，继续吗？')){
      message('已取消更换，已有草稿保留。请重新选择要识别的图片。');
      return;
    }
    pendingImage={file,url};
    $('source').value=file.name;
    syncImageSelection();drafts=[];current=0;renderDraft();message('图片已就绪，点击识别开始拆题。');
  } catch(e){message(e.message+'。已有草稿保留，请重新选择要识别的图片。');}
  finally {
    if(url && pendingImage?.url!==url)URL.revokeObjectURL(url);
    setImportBusy(false);
  }
});
$('extract').onclick=run(async()=>{
  if(!pendingImage||busy)return;
  if(drafts.some(q=>!q.saved) && !confirm('重新识别会替换未保存草稿，继续吗？'))return;
  const file=pendingImage.file, ticket=++generation;setImportBusy(true);
  message('Codex 正在识别整张图片并拆题，请稍候…');
  try {const result=await api('/api/bank/extract',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
    if(ticket!==generation)return;drafts=result.questions;current=0;renderDraft();message(`识别出 ${drafts.length} 道题，请逐题校对后入库。`);
  } finally {setImportBusy(false);}
});
$('manual').onclick=()=>{if(busy)return;drafts.push(blank());current=drafts.length-1;renderDraft();};
$('demo').onclick=()=>{
  if(busy)return;
  if(drafts.some(q=>!q.saved)&&!confirm('演示会替换尚未保存的草稿，继续吗？'))return;
  clearImageSelection();drafts=createDemoQuestions();current=0;
  $('source').value='几何排版示例 · 非真实识别';renderDraft();message('已加载三道几何示例：勾股定理、圆周角、矩形面积。图形由几何 JSON 实时生成 SVG，可修改坐标后更新预览，校对后入库组卷；不调用 Codex。');
};
async function loadBank(){questions=await api('/api/bank/questions');renderBank();}
function renderBank(){
  $('bank-count').textContent=questions.length;$('bank-cards').replaceChildren();
  const term=$('search').value.trim().toLowerCase(),kind=$('kind-filter').value,subject=$('subject-filter').value.trim();
  const filtered=questions.filter(q=>(!kind||q.kind===kind)&&(!subject||q.subject.includes(subject))&&JSON.stringify([q.number,q.source,q.subject,q.tags,q.blocks.map(b=>b.text),q.choices,q.parts]).toLowerCase().includes(term));
  if(!filtered.length)$('bank-cards').append(node('p','暂无匹配题目。先在图片拆题页校对入库。'));
  filtered.forEach(q=>{const card=node('article',undefined,'card');card.append(node('h3',`${q.number} · ${q.subject} · ${q.kind}`),node('p',`${q.tags.join(' / ')}　来源：${q.source} ${q.source_number}`));renderQuestion(q,card);
    const picked=selection.some(s=>s.id===q.id);card.append(button(picked?'✓ 已选，点击移除':'＋ 加入练习卷',()=>{if(picked)selection=selection.filter(s=>s.id!==q.id);else selection.push({id:q.id,lines:q.kind==='选择题'?0:4});renderBank();renderSelection();}));$('bank-cards').append(card);});
  $('selected-count').textContent=selection.length;
}
function renderSelection(){
  $('selection').replaceChildren();$('selected-count').textContent=selection.length;
  selection.forEach((s,i)=>{const q=questions.find(q=>q.id===s.id),row=node('div',undefined,'selection-row');row.append(node('strong',`${i+1}. ${q.number} · ${q.kind}`));
    field(row,'作答留白行数（0～20）',s.lines,v=>s.lines=Number(v)).type='number';
    row.append(button('↑',()=>{if(i){[selection[i-1],selection[i]]=[selection[i],selection[i-1]];renderSelection();}}),button('↓',()=>{if(i<selection.length-1){[selection[i+1],selection[i]]=[selection[i],selection[i+1]];renderSelection();}}),button('移除',()=>{selection.splice(i,1);renderSelection();renderBank();}));$('selection').append(row);});
  if(!selection.length)$('selection').append(node('p','先从题库选择需要的题目。'));$('compose').disabled=!selection.length;
}
async function openPaper(id){
  const data=await api('/api/bank/worksheets/'+id);$('paper').replaceChildren(node('h1',data.title),node('p','姓名：____________　日期：____________','meta'));
  data.items.forEach((item,i)=>{const section=node('section',undefined,'paper-question');section.append(node('h3',`${i+1}. ${item.question.kind}`));renderQuestion(item.question,section);const space=node('div',undefined,'answer-space');space.style.height=`${item.lines*32}px`;section.append(space);$('paper').append(section);});
  $('print').disabled=false;tab('compose');
}
async function loadWorksheets(){const rows=await api('/api/bank/worksheets');$('worksheets').replaceChildren();rows.forEach(w=>$('worksheets').append(button(w.title+' · '+new Date(w.created_at.replace(' ','T')+'Z').toLocaleString('zh-CN'),run(()=>openPaper(w.id)))));}
$('compose').onclick=run(async()=>{$('compose').disabled=true;try {const result=await post('/api/bank/worksheets',{title:$('worksheet-title').value,items:selection});await openPaper(result.id);await loadWorksheets();message('练习卷已保存，可以打印或另存 PDF。');}finally{$('compose').disabled=!selection.length;}});
$('print').onclick=()=>window.print();$('refresh').onclick=run(loadBank);
for(const id of ['search','kind-filter','subject-filter'])$(id).oninput=renderBank;
syncImageSelection();renderDraft();renderSelection();
run(async()=>{await Promise.all([loadBank(),loadWorksheets(),api('/api/status').then(s=>{$('status').textContent=s.message;})]);})();
