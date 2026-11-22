"""Generate reproducible Block v2 examples and browser fixtures, without a model call."""
import base64
import copy
import io
import json
from pathlib import Path
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
import sys
if str(ROOT) not in sys.path: sys.path.insert(0,str(ROOT))


def examples():
    def b(t, **kw): return dict(type=t,version=1,**kw)
    def text(s, **kw):return b('text',text=s,**kw)
    def blank(w=5):return b('blank',display={'widthEm':w})
    def options(*items, mode='single', columns=2):return b('options',mode=mode,display={'columns':columns},children=[b('option',text=x) if isinstance(x,str) else b('option',children=x) for x in items])
    def parts(*items):return b('subquestions',children=[b('subquestion',text=x) if isinstance(x,str) else b('subquestion',children=x) for x in items])
    def table(rows):return b('table',display={'widthPercent':100,'align':'center'},children=[b('row',**({'role':'header'} if i==0 else {}),children=[b('cell',text=c) if isinstance(c,str) else b('cell',children=c) for c in row]) for i,row in enumerate(rows)])
    def geometry():return b('geometry',alt='直角三角形 ABC，AB=4，AC=3',coordinateSystem='screen',viewBox=[0,0,320,260],display={'align':'center','widthPercent':60},points={
        'A':dict(x=60,y=200,label='A',dx=-18,dy=18),'B':dict(x=260,y=200,label='B',dx=8,dy=18),'C':dict(x=60,y=50,label='C',dx=-18,dy=-8)},segments=[dict(id='AB',**{'from':'A'},to='B'),dict(id='AC',**{'from':'A'},to='C'),dict(id='BC',**{'from':'B'},to='C')],rightAngles=[dict(vertex='A',arms=['B','C'],size=12)],labels=[dict(x=160,y=225,text='4'),dict(x=35,y=125,text='3')],givens=[dict(type='length',segment='AB',value=4),dict(type='length',segment='AC',value=3)])
    def chart(typ='bar',multi=False):return b('chart',chartType=typ,alt='四个阅读小组人数统计',display={'align':'center','widthPercent':100},categories=['第一组','第二组','第三组','第四组'],series=[dict(id='count',name='人数',values=[6,8,5,9])] if not multi else [dict(id='boys',name='男生',values=[3,5,2,4]),dict(id='girls',name='女生',values=[3,3,3,5])],xAxis={'title':'小组'},yAxis={'title':'人数','unit':'人','min':0})
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190"><rect x="40" y="30" width="220" height="120" fill="#e4eee6" stroke="#345d46" stroke-width="3"/><text x="150" y="178" font-size="20" text-anchor="middle">8 cm</text><text x="6" y="90" font-size="18">4</text></svg>'
    png=Image.new('RGB',(300,190),'white');draw=ImageDraw.Draw(png);draw.ellipse((65,10,235,180),fill='#e4eee6',outline='#345d46',width=3);out=io.BytesIO();png.save(out,format='PNG')
    assets={'asset_svg':dict(mimeType='image/svg+xml',content=base64.b64encode(svg.encode()).decode()),'asset_png':dict(mimeType='image/png',content=base64.b64encode(out.getvalue()).decode())}
    def image(a,width=60):return b('image',assetId=a,alt='矩形插图' if a=='asset_svg' else '圆形插图',display={'align':'center','widthPercent':width})
    qs=[]
    def q(title,kind,blocks,used=()):
        n=len(qs)+1;blocks=copy.deepcopy(blocks);idx=0
        def ids(nodes):
            nonlocal idx
            for node in nodes:
                idx+=1;node['id']=f'q{n}_b{idx}';ids(node.get('children',[]))
        ids(blocks)
        qs.append(dict(schemaVersion=2,sourceNumber=str(n),subject='数学',kind=kind,tags=[title],warnings=[],blocks=blocks,**({'assets':{a:assets[a] for a in used}} if used else {})))
    q('单空填空','填空题',[text(r'计算 \(3+4=\)'),blank(),text('。')])
    q('多空与行内公式','填空题',[text(r'\((-3)^2=\)'),blank(3),text(r'；\(\sqrt{49}=\)'),blank(4),text(r'；\(|-5|=\)'),blank(5),text('。')])
    q('单选·两列','选择题',[text(r'下列哪个数等于 \(\frac{1}{2}\)？'),options(r'\(0.25\)',r'\(0.5\)',r'\(0.75\)',r'\(1\)')])
    q('多选·四列','选择题',[text('下列哪些数是质数？（多选）'),options('2','3','4','5',mode='multiple',columns=4)])
    q('简单与组合小问','解答题',[text('阅读要求并作答。'),parts('说明你的解题思路。',[text(r'计算 \(3+4=\)'),blank(),text('。')])])
    q('小问内含选项','解答题',[text('完成下面两道题。'),parts([text('选择偶数。'),options('3','4')],[text('请写出两个奇数：'),blank(3),text('、'),blank(3),text('。')])])
    q('公式换行与对齐','计算题',[text('比较两种公式布局：\n下式左对齐。'),text(r'\[\begin{aligned}a &= 3+4 \\ &= 7\end{aligned}\]',display={'align':'left'}),image('asset_svg',35),text('下式居中。'),text(r'\[S=ab=8\times4=32\]',display={'align':'center'})],['asset_svg'])
    q('表格含填空和公式','填空题',[text('填写表格中缺少的数。'),table([['项目','表达式','结果'],['加法',r'\(3+4\)',[blank(3)]],['乘法',r'\(3\times4\)',[blank(3)]]])])
    q('表格内嵌图片','解答题',[text('观察图形，分别写出面积公式。'),table([['图形','面积公式'],[[image('asset_svg',100)],[text(r'\(S=\)'),blank(3)]],[[image('asset_png',60)],[blank(4)]]])],['asset_svg','asset_png'])
    q('柱状图','解答题',[text('四个阅读小组的人数如下。'),chart(),parts([text('人数最多的是第'),blank(3),text('组。')],[text('共有'),blank(3),text('人，平均每组'),blank(3),text('人。')])])
    q('多系列折线图','解答题',[text('比较四个小组的男女人数。'),chart('line',True),parts('哪个小组男生最多？','哪个小组男女生人数相等？')])
    q('几何图·默认60%','解答题',[text(r'如图，\(AB=4\)，\(AC=3\)，\(\angle A=90^\circ\)。'),geometry(),parts([text('斜边长为'),blank(),text('。')],'求三角形的面积。')])
    q('PNG与SVG图文选项','选择题',[text('哪个图形是矩形？'),options([text('图一'),image('asset_svg',100)],[text('图二'),image('asset_png',100)])],['asset_svg','asset_png'])
    q('几何图选项','选择题',[text('哪幅图包含直角标记？'),options([geometry()],[image('asset_png',100)])],['asset_png'])
    q('提示图标','填空题',[b('icon',name='warning',alt='注意',display={'sizeEm':1}),text('结果保留两位小数。\n'),b('icon',name='info',alt='提示'),text(r'\(\frac{1}{3}\approx\)'),blank(),text('。')])
    q('多系列柱图·综合题','解答题',[text('根据表格和统计图完成各题。'),table([['小组','男生','女生'],['第一组','3','3'],['第二组','5','3'],['第三组','2','3'],['第四组','4','5']]),chart('bar',True),parts([text('第二组共有多少人？'),options('5','6','8','9')],[text('女生总人数是'),blank(3),text('人。')],'请描述你从图中发现的一条信息。')])
    from scripts.example_answers import attach
    return attach(qs)


def main():
    qs=examples()
    (ROOT/'samples/blocks-v2.json').write_text(json.dumps(qs,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'static/demo.js').write_text('/* Generated by scripts/generate_examples.py. */\nfunction createDemoQuestions(){return '+json.dumps(qs,ensure_ascii=False,indent=2)+';}\n')
    print(f'Generated {len(qs)} Block v2 examples')
if __name__=='__main__':main()
