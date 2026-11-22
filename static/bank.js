/* Model and user text is rendered as text nodes; only KaTeX creates math markup. */
'use strict';
const $ = id => document.getElementById(id);
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
function renderQuestion(q,parent){const body=node('div',undefined,'question-body');Blocks.flow(q.blocks,body,q.assets||{});parent.append(body);}
let nextId=0;
function uid(){return 'b_'+Date.now().toString(36)+'_'+(++nextId);}
function template(type){
  const base={id:uid(),type,version:1};
  if(type==='text')return {...base,text:'请输入题目内容'};
  if(type==='blank')return {...base,display:{widthEm:5}};
  if(type==='icon')return {...base,name:'info',alt:'提示',display:{sizeEm:1}};
  if(type==='image')return {...base,assetId:'asset_'+uid(),alt:'图片',display:{align:'center',widthPercent:60}};
  if(type==='option'||type==='subquestion'||type==='cell')return {...base,text:type==='cell'?'':'请输入内容'};
  if(type==='options')return {...base,mode:'single',display:{columns:2},children:[template('option'),template('option')]};
  if(type==='subquestions')return {...base,children:[template('subquestion')]};
  if(type==='row')return {...base,children:[template('cell'),template('cell')]};
  if(type==='table')return {...base,display:{align:'center',widthPercent:100},children:[{...template('row'),role:'header'},template('row')]};
  const source=createDemoQuestions().flatMap(q=>q.blocks).find(b=>b.type===type);
  if(!source)throw Error('没有此类型模板');return {...JSON.parse(JSON.stringify(source)),id:base.id};
}
function blank(){return {schemaVersion:2,sourceNumber:'',subject:'数学',kind:'计算题',tags:[],warnings:[],blocks:[template('text')]};}
const rawDrafts=new WeakMap();
function questionPayload(q){return Object.fromEntries(['schemaVersion','sourceNumber','subject','kind','tags','warnings','blocks'].map(k=>[k,q[k]]));}
function applyRaw(blocks){for(const b of blocks){if(rawDrafts.has(b)){const next=JSON.parse(rawDrafts.get(b));for(const k of Object.keys(b))delete b[k];Object.assign(b,next);rawDrafts.delete(b);}if(b.children)applyRaw(b.children);}}
function renderDraft(){
  $('live-preview').replaceChildren();$('source-empty').hidden=!!pendingImage||drafts.length>0;
  $('draft-count').textContent=drafts.length;$('draft-nav').replaceChildren();$('editor').replaceChildren();
  drafts.forEach((q,i)=>{const b=button(q.saved?`✓ ${q.saved}`:`${i+1} · ${q.tags[0]||'新题'}`,()=>{current=i;renderDraft();});b.classList.toggle('active',i===current);$('draft-nav').append(b);});
  const q=drafts[current],editor=$('editor');if(!q){editor.append(node('p','加载示例、识别图片或手动添加题目开始。'));return;}
  if(q.saved){editor.append(node('p','已入库：'+q.saved));renderQuestion(q,editor);return;}
  let validated='',previewTicket=0;
  const check=node('input');check.type='checkbox';check.id='draft-reviewed';check.disabled=true;
  const preview=node('div',undefined,'preview-box');
  const invalidate=()=>{previewTicket++;validated='';check.checked=false;check.disabled=true;};
  const draw=()=>{preview.replaceChildren(node('h3','题面预览'));try{renderQuestion(q,preview);return true;}catch(e){preview.append(node('p',e.message,'warning'));return false;}};
  const updatePreview=async()=>{
    invalidate();const ticket=++previewTicket;
    try{
      applyRaw(q.blocks);if(!draw())throw Error('内容无法渲染，请修正结构后更新预览');const payload=questionPayload(q),snapshot=JSON.stringify(payload);
      await post('/api/bank/validate',payload);
      if(ticket!==previewTicket||snapshot!==JSON.stringify(questionPayload(q)))return;
      validated=snapshot;check.disabled=false;message('预览已通过数据校验，请核对后保存。');
    }catch(e){message(e.message);preview.append(node('p',e.message,'warning'));}
  };
  const edit=(parent,label,value,change,multi=false)=>field(parent,label,value,v=>{change(v);invalidate();},multi);
  const selectField=(parent,label,value,choices,change)=>{
    const l=node('label',label),s=node('select');for(const [v,t]of choices){const o=node('option',t);o.value=v;s.append(o);}s.value=value;
    s.onchange=()=>{change(s.value);invalidate();draw();};l.append(s);parent.append(l);return s;
  };
  if(q.warnings.length)editor.append(node('p',q.warnings.join('；'),'warning'));
  edit(editor,'原卷题号',q.sourceNumber,v=>q.sourceNumber=v);
  edit(editor,'学科',q.subject,v=>q.subject=v);
  selectField(editor,'题型',q.kind,types.map(t=>[t,t]),v=>q.kind=v);
  edit(editor,'知识点（逗号分隔）',q.tags.join('，'),v=>q.tags=v.split(/[,，]/).map(s=>s.trim()).filter(Boolean));
  function addTools(parent,blocks,allowed){
    const bar=node('div',undefined,'toolbar add-blocks'),select=node('select');select.setAttribute('aria-label','添加内容类型');
    for(const t of allowed){const o=node('option',Blocks.names[t]);o.value=t;select.append(o);}select.value=allowed[0];
    bar.append(select,button('＋添加',()=>{const added=template(select.value);if(select.value==='row'&&blocks[0]?.children)added.children=blocks[0].children.map(()=>template('cell'));blocks.push(added);invalidate();renderDraft();}));parent.append(bar);
  }
  const common=['text','blank','image','geometry','chart','table','icon'];
  function editBlocks(blocks,parent,owner){
    blocks.forEach((b,i)=>{
      const box=node('details',undefined,'block-editor');box.open=owner==='question'&&['text','blank','geometry','chart','image'].includes(b.type);
      const title=node('summary',`${Blocks.names[b.type]||b.type} · ${i+1}`);box.append(title);
      const tools=node('div',undefined,'block-tools');
      tools.append(button('↑',()=>{if(i){[blocks[i-1],blocks[i]]=[blocks[i],blocks[i-1]];renderDraft();}}),button('↓',()=>{if(i<blocks.length-1){[blocks[i+1],blocks[i]]=[blocks[i],blocks[i+1]];renderDraft();}}),button('移除',()=>{blocks.splice(i,1);renderDraft();}));box.append(tools);
      if(Object.hasOwn(b,'text')){
        edit(box,'内容（支持 LaTeX，换行直接按回车）',b.text,v=>b.text=v,true);
        if(['option','subquestion','cell'].includes(b.type))box.append(button('转换为组合内容',()=>{const t=b.text;delete b.text;b.children=[{...template('text'),text:t}];renderDraft();}));
      }
      if(b.type==='text'||b.type==='cell')selectField(box,'内容对齐',b.display?.align||'', [['','默认'],['left','左对齐'],['center','居中']],v=>{b.display={...b.display};if(v)b.display.align=v;else delete b.display.align;});
      if(b.type==='blank')edit(box,'空格宽度（em）',b.display?.widthEm??5,v=>{b.display={widthEm:Number(v)};draw();}).type='number';
      if(b.type==='icon'){
        selectField(box,'图标',b.name,[['info','提示'],['warning','注意'],['check','完成']],v=>b.name=v);
        edit(box,'文字描述',b.alt,v=>b.alt=v);edit(box,'尺寸（em）',b.display?.sizeEm??1,v=>b.display={sizeEm:Number(v)}).type='number';
      }
      if(b.type==='options'){
        selectField(box,'选择模式',b.mode,[['single','单选'],['multiple','多选']],v=>b.mode=v);
        selectField(box,'每行选项数',String(b.display?.columns??1),[['1','1'],['2','2'],['4','4']],v=>b.display={columns:Number(v)});
      }
      if(b.type==='row')selectField(box,'行类型',b.role||'', [['','普通行'],['header','表头']],v=>{if(v)b.role=v;else delete b.role;});
      if(['image','geometry','chart','table'].includes(b.type)){
        b.display??={};
        selectField(box,'位置',b.display.align||'center',[['left','左对齐'],['center','居中']],v=>b.display.align=v);
        const label=node('label','显示宽度','geometry-size'),slider=node('input'),output=node('output');slider.type='range';slider.min=20;slider.max=100;slider.step=1;slider.value=b.display.widthPercent??(b.type==='table'?100:60);output.textContent=slider.value+'%';slider.setAttribute('aria-label','显示宽度百分比');
        slider.oninput=()=>{b.display.widthPercent=Number(slider.value);output.textContent=slider.value+'%';invalidate();draw();};label.append(slider,output);box.append(label);
      }
      if(b.type==='image'){
        edit(box,'图片描述',b.alt,v=>b.alt=v);
        const upload=node('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp,image/svg+xml';upload.setAttribute('aria-label','上传图片');
        upload.onchange=run(async()=>{const file=upload.files[0];if(!file)return;invalidate();if(file.size>4*1024*1024)throw Error('图片不能超过 4 MB');
          setImportBusy(true);try{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
          const asset=await post('/api/bank/assets/validate',{mimeType:file.type,content:btoa(binary)});q.assets??={};q.assets[b.assetId]=asset;invalidate();draw();}finally{setImportBusy(false);}
        });box.append(upload);
        // Crop coordinates are editing state, never part of a persisted image block.
        let cropBox=[0,0,1000,1000];edit(box,'从原图裁剪：左、上、右、下（0～1000）',cropBox.join(', '),v=>cropBox=v.split(/[,，]/).map(Number));
        box.append(button('根据坐标重新裁剪',run(()=>{const asset=crop(cropBox);q.assets??={};q.assets[b.assetId]=asset;invalidate();draw();})));
      }
      if(b.type==='geometry'||b.type==='chart'){
        const details=node('details');details.append(node('summary',b.type==='geometry'?'编辑点线与条件 JSON':'编辑图表数据 JSON'));
        const input=edit(details,'结构数据',rawDrafts.get(b)??JSON.stringify(b,null,2),v=>rawDrafts.set(b,v),true);input.className='geometry-editor';input.spellcheck=false;box.append(details);
        // Regenerate the raw editor after changing display to avoid stale JSON overriding sliders.
        for(const child of box.children){if(child.tagName==='LABEL')for(const control of child.children){if(control.tagName==='SELECT'||control.type==='range'){const event=control.tagName==='SELECT'?'onchange':'oninput',fn=control[event];control[event]=()=>{fn();if(!rawDrafts.has(b))input.value=JSON.stringify(b,null,2);else{try{const raw=JSON.parse(rawDrafts.get(b));raw.display=b.display;rawDrafts.set(b,JSON.stringify(raw,null,2));input.value=rawDrafts.get(b);}catch{message('请先修正结构 JSON');}}};}}}
      }
      if(b.children){
        editBlocks(b.children,box,b.type);
        let allowed=b.type==='options'?['option']:b.type==='subquestions'?['subquestion']:b.type==='table'?['row']:b.type==='row'?['cell']:b.type==='subquestion'?[...common,'options']:b.type==='cell'?['text','blank','image','icon']:common;
        addTools(box,b.children,allowed);
        if(['option','subquestion','cell'].includes(b.type)&&b.children.length===1&&b.children[0].type==='text')box.append(button('简化为文字',()=>{b.text=b.children[0].text;delete b.children;renderDraft();}));
      }
      parent.append(box);
    });
  }
  editBlocks(q.blocks,editor,'question');addTools(editor,q.blocks,[...common,'options','subquestions']);
  $('live-preview').append(preview);editor.append(button('更新题面预览',run(updatePreview)));
  const checkLabel=node('label',undefined,'check');checkLabel.append(check,document.createTextNode('已校对题面、分类、公式和图片，确认保存'));editor.append(checkLabel);
  const save=button('保存这一题到题库',run(async()=>{
    if(busy||q.saved)return;
    if(!check.checked||check.disabled||validated!==JSON.stringify(questionPayload(q)))throw Error('请先更新预览、完成校对并勾选确认');
    setImportBusy(true);save.disabled=true;
    try{const data=await post('/api/bank/questions',{question:questionPayload(q),assets:q.assets||{},source:$('source').value,reviewed:true});q.saved=data.number;renderDraft();message('已保存 '+data.number);await loadBank();}
    finally{setImportBusy(false);save.disabled=false;}
  }));save.className='primary';editor.append(save,button('移除这个草稿',()=>{drafts.splice(current,1);current=Math.max(0,current-1);renderDraft();}));
  draw();
}
function crop(box){
  const im=$('source-image');if(!pendingImage||!im.complete||!im.naturalWidth)throw Error('请先选择对应原图');
  const [l,t,r,bt]=box;if(box.length!==4||!box.every(Number.isFinite)||!(0<=l&&l<r&&r<=1000&&0<=t&&t<bt&&bt<=1000))throw Error('裁剪坐标无效');
  const x=Math.floor(l*im.naturalWidth/1000),y=Math.floor(t*im.naturalHeight/1000),w=Math.ceil(r*im.naturalWidth/1000)-x,h=Math.ceil(bt*im.naturalHeight/1000)-y;
  if(w<5||h<5)throw Error('图表区域太小');const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(im,x,y,w,h,0,0,w,h);return {mimeType:'image/png',content:canvas.toDataURL('image/png').split(',')[1]};
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
  $('source').value='题型排版示例 · 非真实识别';renderDraft();message('已加载 16 道新格式示例：多空、图文选项、小问、表格、统计图、几何图和图标。更新预览并校对后可保存组卷，不调用 Codex。');
};
async function loadBank(){questions=await api('/api/bank/questions');renderBank();}
function renderBank(){
  $('bank-count').textContent=questions.length;$('bank-cards').replaceChildren();
  const term=$('search').value.trim().toLowerCase(),kind=$('kind-filter').value,subject=$('subject-filter').value.trim();
  const filtered=questions.filter(q=>(!kind||q.kind===kind)&&(!subject||q.subject.includes(subject))&&JSON.stringify([q.number,q.source,q.subject,q.tags,q.blocks]).toLowerCase().includes(term));
  if(!filtered.length)$('bank-cards').append(node('p','暂无匹配题目。先在图片拆题页校对入库。'));
  filtered.forEach(q=>{const card=node('article',undefined,'card');card.append(node('h3',`${q.number} · ${q.subject} · ${q.kind}`),node('p',`${q.tags.join(' / ')}　来源：${q.source} ${q.sourceNumber}`));renderQuestion(q,card);
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
