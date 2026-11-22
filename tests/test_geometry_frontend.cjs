const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup(){
 const context=vm.createContext({document:{createElementNS:(ns,tag)=>({tag,ns,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},append(n){this.children.push(n);}})}});
 for(const file of ['geometry.js','demo.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../static',file),'utf8'),context);
 return code=>vm.runInContext(code,context);
}
test('SVG output preserves circles, dashed radii, shading and vertex coordinates',()=>{
 const run=setup();
 const [triangle,circle,rectangle]=run('createDemoQuestions().map(q=>Geometry.render(q.blocks.find(b=>b.type==="geometry")))');
 const ab=triangle.children.find(e=>e.tag==='line'&&e.attrs.x2==='640');assert.equal(ab.attrs.y2,'390');
 assert.ok(circle.children.some(e=>e.tag==='circle'&&e.attrs.r==='170'));
 assert.ok(circle.children.some(e=>e.tag==='line'&&e.attrs['stroke-dasharray']==='8 7'));
 assert.ok(rectangle.children.some(e=>e.tag==='polygon'&&e.attrs.fill==='#dfebdf'));
 assert.ok(triangle.children.some(e=>e.tag==='polyline'));
});
test('labels are text only and arbitrary SVG attributes or point references are rejected',()=>{
 const run=setup();
 run('var g=createDemoQuestions()[0].blocks.find(b=>b.type==="geometry")');
 run('g.labels[0].text="<script>alert(1)</script>"');
 const svg=run('Geometry.render(g)');
 assert.ok(svg.children.some(e=>e.tag==='text'&&e.textContent==='<script>alert(1)</script>'));
 assert.ok(!svg.children.some(e=>e.tag==='script'));
 run('g.onload="alert(1)"');assert.throws(()=>run('Geometry.render(g)'),/未知字段/);
 run('delete g.onload;g.segments[0].to="missing"');assert.throws(()=>run('Geometry.render(g)'),/不存在/);
});

test('SVG uses stored percentages with a 60 percent default and rejects invalid widths',()=>{
 const run=setup();run('var g=createDemoQuestions()[0].blocks.find(b=>b.type==="geometry")');
 assert.equal(run('Geometry.render(g)').attrs.style,'width:60%');
 run('g.display.widthPercent=35');assert.equal(run('Geometry.render(g)').attrs.style,'width:35%');
 run('delete g.display');assert.equal(run('Geometry.render(g)').attrs.style,'width:60%');
 run('g.display={widthPercent:101}');assert.throws(()=>run('Geometry.render(g)'),/20～100/);
});
