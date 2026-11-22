# 几何 JSON 与 SVG 渲染

当前版本支持 `geometry` 内容块，与 `text`、`latex`、`image` 并存。题库保存 JSON，浏览器生成 SVG；练习卷复制完整几何 JSON，无需图片资产。格式是本项目定义的 v1，并非通用行业标准。

## 体验方法

1. 首页点击「体验几何三题示例」，选择题 1、2 或 3。
2. 拖动「图形宽度」滑块（20%～100%，默认 60%），旁边的 SVG 和题面预览即时更新。展开「编辑几何 JSON」可编辑坐标。
3. 在「几何 JSON」中修改 `points.B.x`，点击「更新题面预览」，观察点 B 及相连线段移动。
4. 修改 `labels` 可以调整文字和位置。修改绘图坐标不会改变题干、已知长度或标签。
5. 确认后保存到题库，再选题组卷；打印继续使用矢量 SVG。

「＋几何图」会插入一份独立的直角三角形模板。无效 JSON 会显示错误，并阻止校对确认及保存；不会写入半条题目。

## 完整字段

除 `display` 可以省略并采用默认值外，其他字段均为必填，未使用的数组填 `[]`。未知字段被拒绝。

| 字段 | 含义 |
| --- | --- |
| `type` | 固定为 `geometry` |
| `text` | 图形说明，也作为 SVG 无障碍描述 |
| `version` | 当前固定为数字 `1` |
| `coordinateSystem` | 固定为 `screen`，左上原点，x 向右、y 向下 |
| `display` | `{ "widthPercent": 60 }`，宽度占当前题目内容区的百分比，整数 20～100，默认 60；高度等比缩放，居中 |
| `viewBox` | `[左, 上, 宽, 高]`，宽高为正数 |
| `points` | 以点 ID 为键的对象，每点包含 `x`、`y`、`label`、`dx`、`dy` |
| `segments` | 每项包含 `id`、`from`、`to`、布尔值 `dashed` |
| `circles` | 每项包含 `id`、`center`（点 ID）、绘图半径 `radius`、`dashed` |
| `polygons` | 每项包含按轮廓顺序排列的 `points` 点 ID 数组，以及 `fill`（`none` 或 `shade`） |
| `labels` | 独立文字标签，每项含 `x`、`y`、`text` |
| `rightAngles` | 每项含顶点 `vertex`、两个方向点 `arms` 和角标大小 `size` |
| `givens` | 数学已知条件，目前支持线段长度 `length` 与两线段垂直 `perpendicular` |

`dx`、`dy` 表示点名相对点位置的偏移。SVG 文字的 y 是基线位置。图内标签 v1 使用普通文字，可写 `35°`、`cm²`；不支持图内 LaTeX。题干和独立公式块仍支持 LaTeX。

点 ID 和图形 ID 使用字母开头、最长 32 字符的字母数字下划线字符串。点数和每类数组元素最多 100。坐标绝对值不超过 10000，文字最多 500 字符。完整限制以 [JSON Schema](geometry.schema.json) 为准。

## 最小线段示例

```json
{
  "type": "geometry",
  "text": "线段AB长8厘米",
  "version": 1,
  "coordinateSystem": "screen",
  "viewBox": [0, 0, 500, 200],
  "points": {
    "A": {"x": 80, "y": 100, "label": "A", "dx": -10, "dy": 35},
    "B": {"x": 420, "y": 100, "label": "B", "dx": -10, "dy": 35}
  },
  "segments": [{"id": "AB", "from": "A", "to": "B", "dashed": false}],
  "circles": [],
  "polygons": [],
  "labels": [{"x": 220, "y": 85, "text": "8 cm"}],
  "rightAngles": [],
  "givens": [{"type": "length", "segment": "AB", "value": 8, "unit": "cm"}]
}
```

## 校验和实现边界

[geometry.py](geometry.py) 使用 JSON Schema Draft 2020-12 校验类型、枚举、长度和未知字段，并检查点、线段引用、重复 ID、重合端点及非有限数值。前端 [geometry.js](static/geometry.js) 在预览前做对应检查。

`givens` 保存数学条件，不参与坐标求解。第一版不自动检查角是否真正垂直、点是否在圆上、图形是否按实际长度成比例、多边形是否自交，也不会根据移动后的点自动重排标签。角度条件仍放在题干和标签中；`givens` 暂未提供角度类型。

渲染顺序固定为背景、多边形、圆、线段、角标、点及文字。只创建白名单 SVG 元素，用 `textContent` 写标签，不接收 SVG 源码、HTML、脚本、远程资源或自定义属性。

数据库仍是三张业务表，无需建新表或迁移。图片块保留为扫描图、复杂图表的兜底。OCR schema 尚未增加 geometry，避免把未经确认的重建图形当成原图。

## 比例的保存与打印

比例存入 `bank_question.content.blocks[].display.widthPercent`，组卷时随完整几何块复制进 `worksheet.items`。题库、卷子预览和打印使用同一百分比，参照各自的题目内容区宽度；实际像素或毫米数会因容器宽度不同而变化。图内文字与线条一起缩放。滑块调整后需重新勾选校对确认再保存。
