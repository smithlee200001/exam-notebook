/* Shared rendering for preview, question bank and worksheet. Text never becomes HTML. */
'use strict';
const Blocks = (() => {
  const inlineTypes = new Set(['text','blank','icon']);
  const names = {text:'文字与公式',blank:'作答空',options:'选项组',option:'选项',subquestions:'小问组',subquestion:'小问',image:'图片',table:'表格',row:'行',cell:'单元格',chart:'统计图表',geometry:'几何图',icon:'图标'};
  const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function math(parent,source,display,align){
    const n=el(display?'div':'span',undefined,display?'math-display':'math-inline');
    if(display)n.style.textAlign=align||'center';
    // Enlarge fractions without changing inline layout or other operators' math style.
    const macros=display?{}:{'\\frac':'\\dfrac'};
    try {katex.render(source,n,{throwOnError:true,trust:false,output:'mathml',displayMode:display,macros,maxExpand:1000});}
    catch {n.textContent=source;n.title='公式无法解析，请校对 LaTeX';}
    parent.append(n);
  }
  function rich(parent,text,align){
    const re=/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;let pos=0;
    for(const m of text.matchAll(re)){parent.append(document.createTextNode(text.slice(pos,m.index)));math(parent,m[1]??m[2],m[2]!==undefined,align);pos=m.index+m[0].length;}
    parent.append(document.createTextNode(text.slice(pos)));
  }
  function size(n,b,defaultWidth=60){
    n.style.width=(b.display?.widthPercent??defaultWidth)+'%';n.style.maxWidth='100%';
    n.style.marginLeft=b.display?.align==='left'?'0':'auto';n.style.marginRight='auto';
  }
  function flow(blocks,parent,assets){
    let line=null;
    for(const b of blocks){
      if(inlineTypes.has(b.type)){
        if(!line){line=el('div',undefined,'block-flow');parent.append(line);}
        if(b.type==='text'&&b.display?.align)line.style.textAlign=b.display.align;
        render(b,line,assets);
      }else{line=null;render(b,parent,assets);}
    }
  }
  function content(b,parent,assets){if(Object.hasOwn(b,'text'))rich(parent,b.text,b.display?.align);else flow(b.children,parent,assets);}
  function svgElement(tag,attrs={},text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;}
  function chart(b){
    const n=svgElement('svg',{viewBox:'0 0 720 420',role:'img','aria-label':b.alt,class:'chart-diagram'});size(n,b);n.append(svgElement('title',{},b.alt));
    const vals=b.series.flatMap(s=>s.values),lo=b.yAxis.min??Math.min(0,...vals);let hi=Math.max(0,...vals);if(hi===lo)hi=lo+1;
    const left=75,top=45,width=600,height=280,y=v=>top+height-(v-lo)/(hi-lo)*height;
    const add=(tag,attrs,text)=>n.append(svgElement(tag,attrs,text));
    for(let i=0;i<=5;i++){const value=lo+(hi-lo)*i/5,py=y(value);add('line',{x1:left,y1:py,x2:left+width,y2:py,stroke:'#e1e6de'});add('text',{x:left-12,y:py+5,'text-anchor':'end','font-size':14},Number(value.toPrecision(3)));}
    add('line',{x1:left,y1:y(Math.max(lo,Math.min(hi,0))),x2:left+width,y2:y(Math.max(lo,Math.min(hi,0))),stroke:'#465d50'});
    const step=width/b.categories.length,colors=['#477961','#c79447','#6187a9','#9a6c89','#789048'];
    b.categories.forEach((c,i)=>add('text',{x:left+step*(i+.5),y:350,'text-anchor':'middle','font-size':14},c));
    b.series.forEach((s,j)=>{
      const color=colors[j%colors.length],pts=[];
      s.values.forEach((v,i)=>{const x=left+step*(i+.5),py=y(v);pts.push([x,py]);
        if(b.chartType==='bar'){const bw=step*.7/b.series.length;add('rect',{x:left+step*i+step*.15+bw*j,y:Math.min(y(0),py),width:bw*.9,height:Math.abs(y(0)-py),fill:color});}
        else add('circle',{cx:x,cy:py,r:4,fill:color});
      });
      if(b.chartType==='line')add('polyline',{points:pts.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':3});
      add('rect',{x:80+j*120,y:390,width:12,height:12,fill:color});add('text',{x:98+j*120,y:401,'font-size':13},s.name);
    });
    add('text',{x:20,y:22,'font-size':15},b.yAxis.title+(b.yAxis.unit?' / '+b.yAxis.unit:''));
    add('text',{x:675,y:375,'text-anchor':'end','font-size':14},b.xAxis.title);return n;
  }
  function render(b,parent,assets={}){
    let n;
    switch(b.type){
      case 'text': rich(parent,b.text,b.display?.align);return;
      case 'blank':n=el('span',undefined,'answer-blank');n.style.width=(b.display?.widthEm??5)+'em';n.setAttribute('aria-label','作答空');n.setAttribute('data-blank-id',b.id);break;
      case 'icon':n=el('span',{info:'ⓘ',warning:'⚠',check:'✓'}[b.name],'content-icon');n.style.fontSize=(b.display?.sizeEm??1)+'em';n.setAttribute('role','img');n.setAttribute('aria-label',b.alt);if(!b.alt)n.setAttribute('aria-hidden','true');break;
      case 'image':n=el('img');n.alt=b.alt;{const a=assets[b.assetId];n.src=a?`data:${a.mimeType};base64,${a.content}`:'/api/bank/assets/'+encodeURIComponent(b.assetId);}size(n,b);break;
      case 'geometry':n=Geometry.render(b);break;
      case 'chart':n=chart(b);break;
      case 'options':
        n=el('div',undefined,'block-options');n.style.setProperty('--option-columns',b.display?.columns??1);
        b.children.forEach((item,i)=>{const row=el('div',undefined,'block-option');row.append(el('span',String.fromCharCode(65+i)+'.','item-number'));const body=el('div',undefined,'item-content');content(item,body,assets);row.append(body);n.append(row);});break;
      case 'subquestions':
        n=el('div',undefined,'block-subquestions');b.children.forEach((item,i)=>{const row=el('div',undefined,'block-subquestion');row.append(el('span',`（${i+1}）`,'item-number'));const body=el('div',undefined,'item-content');content(item,body,assets);row.append(body);n.append(row);});break;
      case 'table':
        n=el('table',undefined,'content-table');size(n,b,100);
        for(const row of b.children){const tr=el('tr');for(const cell of row.children){const td=el(row.role==='header'?'th':'td');if(cell.display?.align)td.style.textAlign=cell.display.align;content(cell,td,assets);tr.append(td);}n.append(tr);}break;
      default:throw Error('不支持的内容类型：'+b.type);
    }
    n.setAttribute('data-block-id',b.id);parent.append(n);
  }
  return {flow,render,rich,names,chart};
})();
if(typeof module!=='undefined')module.exports=Blocks;
