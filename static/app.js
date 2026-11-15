const $=id=>document.getElementById(id);let paper=null,image=new Image(),region=null,start=null,engine='手工录入';const canvas=$('canvas'),ctx=canvas.getContext('2d');
const tell=t=>$('message').textContent=t;
async function api(url,options={}){const r=await fetch(url,options);const data=await r.json();if(!r.ok)throw Error(data.error||'操作失败');return data}
const post=(url,data)=>api(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
async function busy(button,fn){button.disabled=true;try{await fn()}catch(e){tell(e.message)}finally{button.disabled=false}}
function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);if(region){let[x,y,w,h]=region;ctx.fillStyle='#4b896b22';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#cc7434';ctx.lineWidth=Math.max(3,canvas.width/220);ctx.strokeRect(x,y,w,h);$('coords').textContent=`x ${x} · y ${y} · 宽 ${w} · 高 ${h} px`}}
// A revision identifies a particular selection, even after selecting A → B → A.
let revision=0,requestId=0;
const manualHint='可直接手工录入；不会自动判题、识别手写答案或教师批改。';
function syncOcrButtons(pending=false){
  $('ocr').disabled=pending||!region;
  $('mock').disabled=pending||!region||paper?.source!=='synthetic';
}
function invalidateOcr(){requestId++;syncOcrButtons()}
function clearDraft(){
  $('form').reset();engine='手工录入';$('engine').textContent=manualHint;
}
function setRegion(box){
  if(JSON.stringify(region)===JSON.stringify(box))return;
  region=box?box.slice():null;revision++;invalidateOcr();clearDraft();
}
function reset(){if(!paper||!region)return;setRegion([0,0,paper.width,paper.height]);draw();$('reviewed').checked=false}
function point(e){const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(canvas.width,Math.round((e.clientX-b.left)*canvas.width/b.width))),Math.max(0,Math.min(canvas.height,Math.round((e.clientY-b.top)*canvas.height/b.height)))]}
canvas.onpointerdown=e=>{if(!paper||!region)return;invalidateOcr();start=point(e);canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!start)return;const p=point(e);setRegion([Math.min(p[0],start[0]),Math.min(p[1],start[1]),Math.abs(p[0]-start[0]),Math.abs(p[1]-start[1])]);draw()};canvas.onpointerup=()=>{start=null;$('reviewed').checked=false};canvas.onpointercancel=()=>{start=null};$('reset').onclick=reset;
async function select(p,box=null){
  paper=p;start=null;revision++;setRegion(null);invalidateOcr();clearDraft();
  const selectedRevision=revision,loadedImage=new Image();image=loadedImage;
  canvas.style.display='none';$('coords').textContent='图片加载中…';
  loadedImage.onload=()=>{
    if(revision!==selectedRevision||image!==loadedImage)return;
    canvas.width=p.width;canvas.height=p.height;canvas.style.display='block';
    $('empty').style.display='none';setRegion(box||[0,0,p.width,p.height]);draw();
  };
  loadedImage.src='/images/'+p.image;$('papers').value=p.id;
}
async function listPapers(id){const ps=await api('/api/papers');$('papers').replaceChildren();for(const p of ps){const o=document.createElement('option');o.value=p.id;o.textContent=p.title;$('papers').append(o)}if(ps.length)await select(ps.find(p=>p.id===id)||ps[0]);$('papers').onchange=()=>select(ps.find(p=>p.id===$('papers').value))}
$('sample').onclick=()=>busy($('sample'),async()=>{const p=await post('/api/sample',{});await listPapers(p.id);tell('合成试卷已加载。可框选识别，或点击“填入演示文字”查看校对流程。')});
$('file').onchange=()=>busy($('sample'),async()=>{const f=$('file').files[0];if(!f)return;const fd=new FormData();fd.append('file',f);fd.append('title',f.name);const p=await api('/api/upload',{method:'POST',body:fd});await listPapers(p.id);tell('上传成功，照片仅保存在本机。请框选需要收录的题目。');$('file').value=''});
async function recognize(mode,button){
  if(!paper||!region||start){tell('请先选择试卷选区');return}
  const id=++requestId,selectedRevision=revision,pid=paper.id,box=region.slice();
  const current=()=>id===requestId&&selectedRevision===revision&&paper?.id===pid;
  syncOcrButtons(true);
  try{
    const data=await post('/api/ocr',{paper_id:pid,region:box,mode,lang:$('lang').value});
    if(!current())return;
    $('stem').value=data.text;engine=data.engine;$('engine').textContent=engine;
    $('reviewed').checked=false;
    tell(data.text?'文字已填入，请逐字核对，尤其是公式与上下标。':'未识别到文字，请调整选区或手动录入。');
  }catch(e){if(current())tell(e.message)}
  finally{if(current())syncOcrButtons()}
}
$('ocr').onclick=()=>recognize('real',$('ocr'));$('mock').onclick=()=>recognize('sample',$('mock'));
$('form').oninput=()=>{invalidateOcr();$('reviewed').checked=false};$('reviewed').oninput=e=>e.stopPropagation();
$('form').onsubmit=e=>{e.preventDefault();busy($('save'),async()=>{if(!paper||!region||start)throw Error('请先完成选区');const savedRevision=revision;const payload={paper_id:paper.id,region:region.slice(),reviewed:$('reviewed').checked,ocr_engine:engine};for(const key of ['stem','student_answer','correct_answer','analysis','tags','reason','grading'])payload[key]=$(key).value;await post('/api/questions',payload);tell('已保存到本机错题集。');if(revision===savedRevision)$('reviewed').checked=false;await cards()})};
async function cards(){const qs=await api('/api/questions');$('count').textContent=qs.length;$('cards').replaceChildren();if(!qs.length){$('cards').textContent='尚未收录错题，先完成右侧的人工校对。';return}for(const q of qs){const c=document.createElement('article');c.className='card';for(const [tag,text]of [['div',q.title],['h3',q.payload.stem],['p','学生作答：'+(q.payload.student_answer||'未录入')],['p','正确答案：'+(q.payload.correct_answer||'待确认')],['p',q.payload.analysis],['p','教师批改：'+(q.payload.grading||'未录入')],['p','错因：'+(q.payload.reason||'未确认')],['small',q.payload.tags],['p','原图选区：'+q.payload.region.join(', ')+' px']]){const el=document.createElement(tag);el.textContent=text;c.append(el)}const b=document.createElement('button');b.textContent='查看来源与选区';b.onclick=async()=>{const ps=await api('/api/papers');await select(ps.find(p=>p.id===q.paper_id),q.payload.region);window.scrollTo({top:180,behavior:'smooth'})};c.append(b);$('cards').append(c)}}
(async()=>{try{const s=await api('/api/status');$('status').textContent=s.ocr?`本地 OCR 可用 · ${s.languages.join(' / ')}`:'未检测到 Tesseract · 可手工录入';if(s.languages.includes('chi_sim'))$('lang').value='chi_sim+eng';await listPapers();await cards()}catch(e){tell(e.message)}})();
