/* Version 1: allowlisted SVG elements, attributes and text nodes only. */
'use strict';
const Geometry = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  function validate(g) {
    const fail = message => { throw Error('几何 JSON：' + message); };
    const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 10000;
    const number = n => { if (!finite(n)) fail('坐标或数值无效'); };
    const text = t => { if(typeof t!=='string'||t.length>500||t.includes('\0'))fail('文字无效'); };
    const name = s => typeof s==='string' && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(s);
    const object = (v, keys) => {
      if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('字段缺失或包含未知字段');
    };
    const array = (v,min=0,max=100) => {if(!Array.isArray(v)||v.length<min||v.length>max)fail('数组长度无效');};
    g=JSON.parse(JSON.stringify(g));
    for(const key of ['segments','circles','polygons','labels','rightAngles','givens'])g[key]??=[];
    for(const e of [...g.segments,...g.circles])e.dashed??=false;
    g.display={align:'center',widthPercent:60,...g.display};
    object(g,['id','display','type','alt','version','coordinateSystem','viewBox','points','segments','circles','polygons','labels','rightAngles','givens']);
    if(g.type!=='geometry'||g.version!==1||g.coordinateSystem!=='screen')fail('不支持的类型、版本或坐标系');
    object(g.display,['widthPercent','align']);
    if(!['left','center'].includes(g.display.align))fail('对齐无效');
    if(!Number.isInteger(g.display.widthPercent)||g.display.widthPercent<20||g.display.widthPercent>100)fail('显示宽度必须是 20～100 的整数百分比');
    text(g.alt);array(g.viewBox,4,4);g.viewBox.forEach(number);if(g.viewBox[2]<=0||g.viewBox[3]<=0)fail('画布尺寸必须为正数');
    if(!g.points||typeof g.points!=='object'||Array.isArray(g.points))fail('points 必须是对象');
    const entries=Object.entries(g.points);if(!entries.length||entries.length>100)fail('点数量无效');
    for(const [key,p] of entries){if(!name(key))fail('点 ID 无效');object(p,['x','y','label','dx','dy']);[p.x,p.y,p.dx,p.dy].forEach(number);text(p.label);}
    const point = key => {if(!name(key)||!Object.hasOwn(g.points,key))fail('引用了不存在的点 '+key);return g.points[key];};
    const distinct = (a,b) => {const p=point(a),q=point(b);if(p.x===q.x&&p.y===q.y)fail('线段端点重合');};
    for(const key of ['segments','circles','polygons','labels','rightAngles','givens'])array(g[key]);
    const ids=new Set(),segments=new Set();
    for(const e of [...g.segments,...g.circles]){if(!name(e.id)||ids.has(e.id))fail('元素 ID 无效或重复');ids.add(e.id);if(typeof e.dashed!=='boolean')fail('dashed 必须为布尔值');}
    for(const s of g.segments){object(s,['id','from','to','dashed']);distinct(s.from,s.to);segments.add(s.id);}
    for(const c of g.circles){object(c,['id','center','radius','dashed']);point(c.center);number(c.radius);if(c.radius<=0)fail('半径必须为正数');}
    for(const p of g.polygons){object(p,['points','fill']);array(p.points,3);p.points.forEach(point);if(new Set(p.points).size!==p.points.length||!['none','shade'].includes(p.fill))fail('多边形顶点或填充无效');}
    for(const l of g.labels){object(l,['x','y','text']);number(l.x);number(l.y);text(l.text);}
    for(const a of g.rightAngles){object(a,['vertex','arms','size']);array(a.arms,2,2);distinct(a.vertex,a.arms[0]);distinct(a.vertex,a.arms[1]);if(a.arms[0]===a.arms[1]||!finite(a.size)||a.size<1||a.size>100)fail('角标无效');}
    for(const v of g.givens){
      if(v.type==='length'){object(v,Object.hasOwn(v,'unit')?['type','segment','value','unit']:['type','segment','value']);if(!segments.has(v.segment)||!finite(v.value)||v.value<=0||(v.unit!==undefined&&!['mm','cm','m'].includes(v.unit)))fail('长度条件无效');}
      else if(v.type==='perpendicular'){object(v,['type','segments']);array(v.segments,2,2);if(v.segments[0]===v.segments[1]||v.segments.some(s=>!segments.has(s)))fail('垂直条件无效');}
      else fail('不支持的已知条件');
    }
    return g;
  }
  function render(data) {
    const g=validate(data);
    const el=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;};
    const svg=el('svg',{viewBox:g.viewBox.join(' '),class:'geometry-diagram',style:`width:${g.display.widthPercent}%;margin-left:${g.display.align==='left'?'0':'auto'};margin-right:auto`,role:'img','aria-label':g.alt||'几何示意图',xmlns:NS});
    svg.append(el('title',{},g.alt||'几何示意图'));
    const [x,y,w,h]=g.viewBox;svg.append(el('rect',{x,y,width:w,height:h,fill:'white'}));
    const stroke={fill:'none',stroke:'#263d35','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'};
    const p=id=>g.points[id];
    for(const poly of g.polygons)svg.append(el('polygon',{...stroke,points:poly.points.map(id=>`${p(id).x},${p(id).y}`).join(' '),fill:poly.fill==='shade'?'#dfebdf':'none'}));
    for(const c of g.circles)svg.append(el('circle',{...stroke,cx:p(c.center).x,cy:p(c.center).y,r:c.radius,...(c.dashed?{'stroke-dasharray':'8 7'}:{})}));
    for(const s of g.segments)svg.append(el('line',{...stroke,x1:p(s.from).x,y1:p(s.from).y,x2:p(s.to).x,y2:p(s.to).y,...(s.dashed?{'stroke-dasharray':'8 7',stroke:'#7b8b7f'}:{})}));
    for(const a of g.rightAngles){
      const o=p(a.vertex),unit=id=>{const t=p(id),l=Math.hypot(t.x-o.x,t.y-o.y);return [(t.x-o.x)/l*a.size,(t.y-o.y)/l*a.size];};
      const u=unit(a.arms[0]),v=unit(a.arms[1]);
      svg.append(el('polyline',{...stroke,'stroke-width':2,points:`${o.x+u[0]},${o.y+u[1]} ${o.x+u[0]+v[0]},${o.y+u[1]+v[1]} ${o.x+v[0]},${o.y+v[1]}`}));
    }
    const label=(x,y,t)=>svg.append(el('text',{x,y,fill:'#263d35','font-family':'Arial, sans-serif','font-size':26},t));
    for(const point of Object.values(g.points)){svg.append(el('circle',{cx:point.x,cy:point.y,r:3,fill:'#263d35'}));if(point.label)label(point.x+point.dx,point.y+point.dy,point.label);}
    for(const l of g.labels)label(l.x,l.y,l.text);
    return svg;
  }
  return {validate,render};
})();
if(typeof module!=='undefined')module.exports=Geometry;
