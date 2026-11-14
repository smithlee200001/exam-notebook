"""Regenerate synthetic fixture. Font path can be supplied; no student data."""
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont
font = sys.argv[1] if len(sys.argv)>1 else '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'
im = Image.new('RGB',(1200,1600),'white');d=ImageDraw.Draw(im)
def text(x,y,s,size=30):d.text((x,y),s,font=ImageFont.truetype(font,size),fill='#25382c')
text(100,70,'七年级数学 · 合成演示试卷',44)
text(100,150,'非真实试卷 / 不含学生个人信息',24)
d.line((100,220,1100,220),fill='#b6bdb5',width=2)
text(100,280,'1. 计算：(-3)² - 2 × 4 = ____。')
text(100,430,'2. 解方程：3x + 5 = 20。')
text(100,640,'3. 三角形的两个内角分别为 45° 和 65°，')
text(100,700,'   求第三个内角的度数。')
d.polygon([(380,850),(160,1200),(850,1200)],outline='#25382c',width=4)
text(170,1130,'45°');text(730,1130,'65°');text(360,870,'?')
text(100,1380,'English OCR test: 3x + 5 = 20',32)
text(100,1450,'Answer: x = 5',32)
im.save(Path(__file__).with_name('exam.png'))
