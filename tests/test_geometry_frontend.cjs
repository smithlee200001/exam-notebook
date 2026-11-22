const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function setup(){
 const element=tag=>({tag,attrs:{},style:{setProperty(k,v){this[k]=v;}},children:[],setAttribute(k,v){this.attrs[k]=v;},append(...nodes){this.children.push(...nodes);}});
 const katex=require('../static/vendor/katex/katex.min.js');
 const context=vm.createContext({katex:{render:(source,target,options)=>{target.markup=katex.renderToString(source,options);}},document:{createElement:element,createElementNS:(ns,t)=>element(t),createTextNode:text=>({textContent:text})}});
 for(const file of ['geometry.js','blocks.js','demo.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../static',file),'utf8'),context);
 return code=>vm.runInContext(code,context);
}
test('geometry SVG preserves coordinates, right angles and widths',()=>{
 const run=setup();const svg=run('Geometry.render(createDemoQuestions()[11].blocks[1])');
 assert.ok(svg.children.some(e=>e.tag==='polyline'));assert.ok(svg.children.some(e=>e.tag==='line'&&e.attrs.x2==='260'));
 assert.match(svg.attrs.style,/width:60%/);
 run('var g=createDemoQuestions()[11].blocks[1];g.display={widthPercent:35,align:"left"}');assert.match(run('Geometry.render(g)').attrs.style,/width:35%;margin-left:0/);
});
test('geometry rejects unknown SVG fields and missing references',()=>{
 const run=setup();run('var g=createDemoQuestions()[11].blocks[1];g.onload="bad"');assert.throws(()=>run('Geometry.render(g)'),/未知字段/);
 run('delete g.onload;g.segments[0].to="missing"');assert.throws(()=>run('Geometry.render(g)'),/不存在/);
});
test('bar heights correspond to values and line chart has two data series',()=>{
 const run=setup();const bar=run('Blocks.chart(createDemoQuestions()[9].blocks[1])');
 const bars=bar.children.filter(e=>e.tag==='rect').slice(0,4);assert.equal(bars.length,4);const heights=bars.map(e=>Number(e.attrs.height));assert.ok(Math.abs(heights[0]/heights[3]-6/9)<1e-10);
 const line=run('Blocks.chart(createDemoQuestions()[10].blocks[1])');assert.equal(line.children.filter(e=>e.tag==='polyline').length,2);
 assert.equal(line.children.filter(e=>e.tag==='circle').length,8);
});
test('text is never interpreted as HTML and display math has explicit alignment',()=>{
 const run=setup();run('var root=document.createElement("div");Blocks.flow([{id:"t",type:"text",version:1,text:"<script>x</script>\\n\\\\[a=1\\\\]",display:{align:"left"}}],root,{})');
 const root=run('root');assert.equal(root.children[0].children[0].textContent.startsWith('<script>'),true);
});

// Use the bundled KaTeX engine so these assertions inspect actual MathML output.
test('inline fractions use display-sized numerals throughout nested content without rewriting source',()=>{
 const run=setup();
 run('var q=createDemoQuestions()[2];var original=JSON.stringify(q);var root=document.createElement("div");Blocks.flow(q.blocks,root,{})');
 const all=n=>[n,...(n.children||[]).flatMap(all)];
 assert.ok(all(run('root')).some(n=>n.markup?.includes('displaystyle="true"')));
 assert.equal(run('JSON.stringify(q)'),run('original'));
 const source=String.raw`\frac{1}{1+\frac{1}{2}}`;
 for(const type of ['option','subquestion','cell']){
   const item={id:'item',type,version:1,text:'\\('+source+'\\)'};
   const group=type==='option'?{type:'options',children:[item]}:type==='subquestion'?{type:'subquestions',children:[item]}:{type:'table',children:[{type:'row',children:[item]}]};
   run('var root=document.createElement("div");Blocks.render('+JSON.stringify(group)+',root,{})');
   const markup=all(run('root')).find(n=>n.markup)?.markup;
   assert.equal((markup.match(/displaystyle="true"/g)||[]).length,2);
 }
});
test('explicit small fractions, inline sums and display formulas retain their intended style',()=>{
 const run=setup(),katex=require('../static/vendor/katex/katex.min.js');
 for(const [source,display]of [[String.raw`\tfrac{1}{2}`,false],[String.raw`\sum_{i=1}^n i`,false],[String.raw`\frac{1}{2}`,true]]){
   const text=display?'\\['+source+'\\]':'\\('+source+'\\)';
   run('var root=document.createElement("div");Blocks.rich(root,'+JSON.stringify(text)+')');
   const markup=run('root').children.find(n=>n.markup)?.markup;
   assert.equal(markup,katex.renderToString(source,{output:'mathml',displayMode:display}));
 }
});
