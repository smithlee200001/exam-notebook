/* Answers use question node IDs; labels are always derived from the current snapshot. */
'use strict';
const Answers=(()=>{
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const key=t=>t.target==='question'?'@question':t.targetId;
  function targets(q){
    const result=[];function visit(nodes,prefix=''){for(const b of nodes){
      if(b.type==='options')result.push({target:'block',targetId:b.id,type:'choice',label:prefix+'选择题',mode:b.mode,options:b.children});
      else if(b.type==='blank')result.push({target:'block',targetId:b.id,type:'fill',label:prefix});
      else if(b.type==='subquestions')b.children.forEach((s,i)=>{const before=result.length;visit(s.children||[],prefix+`（${i+1}）`);if(before===result.length)result.push({target:'block',targetId:s.id,type:'solution',label:prefix+`（${i+1}）解答`});});
      else visit(b.children||[],prefix);
    }}visit(q.blocks);
    if(!result.length)result.push({target:'question',type:'solution',label:'整题解答'});
    const counts={};for(const t of result)if(t.type==='fill'){const p=t.label;counts[p]=(counts[p]||0)+1;t.label=p+`第${counts[p]}空`;}
    return result;
  }
  function render(q,answer,parent,assets={}){
    const box=el('div',undefined,'answer-content question-body'),ts=targets(q),entries=answer?.entries||[];let missing=0;
    for(const t of ts){const row=el('section',undefined,'answer-entry');row.append(el('strong',t.label));const e=entries.find(e=>key(e)===key(t));
      if(!e){missing++;row.append(el('p','未录入答案','hint'));}
      else {
        if(e.type==='choice'){const labels=t.options.map((o,i)=>e.optionIds.includes(o.id)?String.fromCharCode(65+i):null).filter(Boolean);row.append(el('p','答案：'+labels.join('、')));}
        else if(e.type==='fill'){const p=el('div');p.append(el('span','答案：'));Blocks.rich(p,e.text);row.append(p);if(e.alternatives?.length){const a=el('div',undefined,'hint');a.append(el('span','其他可接受表达：'));e.alternatives.forEach((s,i)=>{if(i)a.append(el('span','；'));Blocks.rich(a,s);});row.append(a);}}
        else Blocks.flow(e.blocks,row,assets);
        if(e.explanation?.length){row.append(el('div','解析','answer-explanation-label'));Blocks.flow(e.explanation,row,assets);}
      }box.append(row);
    }
    const stale=entries.filter(e=>!ts.some(t=>key(t)===key(e)));
    if(stale.length)box.append(el('p','存在失效的答案目标，请重新校验。','warning'));
    box.append(el('p',!entries.length?'未录入答案':missing?`已录入 ${ts.length-missing}/${ts.length} 项，仍有 ${missing} 项未录入。`:'答案已完整录入。','hint'));
    parent.append(box);
  }
  function editor(q,initial,parent,onChange,assets={},upload){
    let entries=JSON.parse(JSON.stringify(initial?.entries||[]));
    const errors=new Set(),jsonInputs=[];
    const emit=()=>{for(const item of jsonInputs)if(!errors.has(item.input))item.input.value=JSON.stringify(item.read()||[],null,2);onChange(entries.length?{schemaVersion:1,entries:JSON.parse(JSON.stringify(entries))}:null,errors.size>0);};
    const ts=targets(q);parent.append(el('p','可只录入部分答案。填空的其他表达仅供人工参考，不自动判分。','hint'));
    for(const t of ts){
      let entry=entries.find(e=>key(e)===key(t));
      const box=el('details',undefined,'answer-editor-item');box.open=true;box.append(el('summary',t.label));
      const ensure=()=>{if(!entry){entry={target:t.target,type:t.type,...(t.targetId?{targetId:t.targetId}:{})};if(t.type==='choice')entry.optionIds=[];else if(t.type==='fill'){entry.text='';entry.alternatives=[];}else entry.blocks=[];entries.push(entry);}return entry;};
      const field=(label,value,change)=>{const l=el('label',label),input=el('textarea');input.value=value;input.oninput=()=>{change(input.value);emit();};l.append(input);box.append(l);return input;};
      if(t.type==='choice'){
        t.options.forEach((o,i)=>{const l=el('label',undefined,'check'),c=el('input');c.type='checkbox';c.checked=entry?.optionIds.includes(o.id)||false;c.setAttribute('aria-label',t.label+'正确选项'+String.fromCharCode(65+i));
          c.onchange=()=>{const e=ensure();e.optionIds=c.checked?(t.mode==='single'?[o.id]:[...e.optionIds.filter(x=>x!==o.id),o.id]):e.optionIds.filter(x=>x!==o.id);if(t.mode==='single')for(const other of box.querySelectorAll('input[type=checkbox]'))if(other!==c)other.checked=false;emit();};
          l.append(c,el('span',String.fromCharCode(65+i)+'. '));const content=el('div',undefined,'question-body');if(Object.hasOwn(o,'text'))Blocks.rich(content,o.text);else Blocks.flow(o.children,content,assets);l.append(content);box.append(l);
        });
      }else if(t.type==='fill'){
        field('标准答案（支持 LaTeX）',entry?.text||'',v=>ensure().text=v);
        field('其他可接受表达（每行一项，可留空）',(entry?.alternatives||[]).join('\n'),v=>ensure().alternatives=v.split('\n').filter(s=>s.trim()));
      }else{
        const simple=!entry?.blocks?.length||entry.blocks.length===1&&entry.blocks[0].type==='text';
        if(simple)field('标准解答（支持 LaTeX）',entry?.blocks?.[0]?.text||'',v=>ensure().blocks=[{id:'solution_'+(t.targetId||'whole'),type:'text',version:1,text:v}]);
      }
      // Advanced blocks permit diagrams/tables without inventing a second answer renderer.
      const jsonField=(label,name)=>{const details=el('details');details.append(el('summary',label));const input=el('textarea');input.className='geometry-editor';input.value=JSON.stringify(entry?.[name]||[],null,2);const error=el('p',undefined,'warning');error.hidden=true;
        jsonInputs.push({input,read:()=>entry?.[name]});
        input.oninput=()=>{try{const v=JSON.parse(input.value);if(!Array.isArray(v))throw Error('需要 Block 数组');ensure()[name]=v;errors.delete(input);error.hidden=true;emit();}catch(e){error.textContent=e.message;error.hidden=false;errors.add(input);emit();}};details.append(input,error);box.append(details);};
      if(t.type==='solution')jsonField('高级：编辑完整解答 Block JSON','blocks');
      const simpleExplanation=!entry?.explanation?.length||entry.explanation.length===1&&entry.explanation[0].type==='text';
      if(simpleExplanation)field('解析（可留空，支持 LaTeX）',entry?.explanation?.[0]?.text||'',v=>ensure().explanation=v.trim()?[{id:'explanation_'+(t.targetId||'whole'),type:'text',version:1,text:v}]:[]);
      jsonField('高级：编辑完整解析 Block JSON','explanation');
      if(upload){const input=el('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/svg+xml';const l=el('label','向解析添加图片');l.append(input);box.append(l);input.onchange=async()=>{const file=input.files[0];if(!file)return;input.disabled=true;try{const aid=await upload(file);const e=ensure();e.explanation??=[];e.explanation.push({id:'answer_image_'+Date.now(),type:'image',version:1,assetId:aid,alt:file.name,display:{align:'center',widthPercent:60}});emit();}catch(e){const p=el('p',e.message,'warning');box.append(p);}finally{input.disabled=false;}};}
      const clear=el('button','清空此项');clear.type='button';clear.onclick=()=>{entries=entries.filter(e=>key(e)!==key(t));entry=null;for(const input of box.querySelectorAll('textarea,input')){errors.delete(input);if(input.type==='checkbox')input.checked=false;else if(input.type!=='file')input.value='';}emit();};box.append(clear);parent.append(box);
    }
    const stale=entries.filter(e=>!ts.some(t=>key(t)===key(e)));if(stale.length){const remove=el('button','移除失效目标的答案');remove.type='button';remove.onclick=()=>{entries=entries.filter(e=>ts.some(t=>key(t)===key(e)));emit();parent.replaceChildren();editor(q,entries.length?{schemaVersion:1,entries}:null,parent,onChange,assets,upload);};parent.append(el('p','题面目标已变化，存在失效答案。','warning'),remove);}
  }
  return {targets,render,editor};
})();
