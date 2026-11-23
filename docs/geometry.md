# 几何 JSON 与 SVG

几何图使用 `type: "geometry"`，基础字段为 `id/type/version`，描述使用 `alt`，不再使用旧 `text` 描述字段。显示参数为 `display.align` 和 `display.widthPercent`，默认居中、60%。

数据字段：`coordinateSystem: "screen"`、`viewBox`、`points`，以及可省略的空集合 `segments/circles/polygons/labels/rightAngles/givens`。线段和圆的 `dashed` 默认 false。长度条件可以省略单位。

完整格式与例子见 [blocks.md 第 10 节](blocks.md#10-geometry几何图形)。当前约束以 [notebook/schemas/geometry.schema.json](../notebook/schemas/geometry.schema.json) 和 [notebook/domain/geometry.py](../notebook/domain/geometry.py) 为准。

点 ID 在图内唯一，线段引用点，条件引用线段。坐标 x 向右、y 向下。坐标负责绘图，题目的实际长度由 `givens` 描述。标签是纯文字，不负责推导数学条件；修改坐标不会自动解题或修改给定长度。

`static/js/render/geometry.js` 只创建白名单 SVG 元素和文字节点，不执行任意 SVG 字符串。外部 SVG 上传使用 `image` 资产类型。

页面可展开“几何图”修改 JSON；修改后点“更新题面预览”校验。宽度滑块即时预览，保存题目及组卷都会保留比例。图形嵌入选项后，其百分比以选项内容区域为基准。

例 12 展示普通几何题，例 14 展示几何选项；两者均包含直角标记。运行 `python -m scripts.generate_examples` 可重新生成示例。

## 用 Codex 重绘一幅配图

整页拆题会给每个 image 块分配原图资产。需要重绘时，将该块对应的裁图字节、块 ID 和同一道题的题干传给下列入口。每次调用处理一幅图，返回几何草稿或保留原图的原因。提示词随项目存放在 [geometry_redraw.txt](../notebook/prompts/geometry_redraw.txt)。

```python
import base64
from notebook.services.geometry_redraw import redraw_geometry

# extracted 是 extract() 返回的单道题，image_block 是该题中选定的 image 块。
asset = extracted["assets"][image_block["assetId"]]
draft, reason = redraw_geometry(
    base64.b64decode(asset["content"], validate=True),
    block_id=image_block["id"],
    question_text=question_text,  # 该图所属题干，必要时附对应小题
)
```

调用方保留原裁图供对照。若得到草稿，用前端的 `Geometry.render(draft)` 按实际展示宽度预览，核对点线关系、虚实线、角弧所在扇区和角编号。逐个查看字形（含撇号）与线条、角弧、邻近文字的间距；可将文字层、线条层分别渲染后检查像素交叠。发现压线时微调点名的 `dx/dy` 或角编号的 `x/y`，再次渲染。通过校对后按块 ID 替换对应题目的配图，保存并回读核对。若返回 `(None, reason)` 或调用失败，继续使用原裁图。
