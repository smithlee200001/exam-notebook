# 题目内容数据类型设计

状态：已按讨论实现首版。本文记录数据设计；第 12.2 节仍仅作为后续优化规划。当前实现与数据库说明见 [DATABASE.md](DATABASE.md)，可运行示例见 [EXAMPLES.md](EXAMPLES.md)。

实现采用新设计，使用独立的默认数据目录 `data/blocks-v2`，不转换、清空或兼容旧数据库。本文中明确标为后续建议的内容不作为已实现功能。

## 1. 设计原则

一道题的内容是一棵有序 Block 树。所有节点使用公共身份字段，各类型直接使用有明确含义的专属字段，不再强制包装到 `data` 对象。

- 文字与 LaTeX 合并为 `text` 类型。
- 填空使用独立 `blank`，每个空拥有稳定 ID。
- 简单选项、小问和单元格直接使用 `text` 字段。
- 复杂选项、小问和单元格使用 `children`；与 `text` 互斥。
- 图形、图表内部的坐标和数值使用普通对象或数组，不将所有数据包装成 Block。
- 数组顺序决定显示顺序；编号由容器生成，不混入正文。
- 排版配置存入内容，组卷时一起保存。

### 1.1 设计状态

已讨论确定：本文列出的 13 种类型及其主要字段、简单内容与组合内容的两种形式、文字和填空直接连续排列。

后续优化规划：彻底删除 `paragraph` 类型、容器对齐的统一继承规则、所有类型的完整父子约束及第 12.2 节中的其他统一建议。根据本轮范围决定，这些内容暂不在代码中体现，不作为本轮实现或验收要求；后续启动相应优化时再评估。示例均不依赖 `paragraph`。

## 2. 统一 Block 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 节点稳定标识；同一道题的 Block 和填空 ID 不重复 |
| `type` | string 枚举 | 节点类型，决定其余字段和渲染规则 |
| `version` | integer | 此类型结构版本，本文均为 `1` |
| `display` | object，可省略 | 类型适用的排版参数 |
| `text` | string，按类型使用 | 文字及 LaTeX 内容 |
| `children` | Block 数组，按类型使用 | 有序子节点 |

`mode`、`assetId`、`points`、`series` 等专属字段直接放在所属 Block 顶层。不是所有类型都具有 `text` 或 `children`，也不要求填写空 `data: {}`。

节点编辑或调换位置时保持 ID。示例中的 `opt_1` 只是稳定标识，不绑定显示字母 A。题目复制时可生成新 ID 并同步内部引用；组卷快照保留内容 ID。

### 2.1 类型清单

| 类型 | 职责 | 主要字段 |
|---|---|---|
| `text` | 文字与公式 | `text` |
| `blank` | 作答空 | `display.widthEm` |
| `options` | 选项组 | `mode`、`children` |
| `option` | 一个选项 | `text` 或 `children` |
| `subquestions` | 小问组 | `children` |
| `subquestion` | 一个小问 | `text` 或 `children` |
| `image` | 图片资产引用 | `assetId`、`alt` |
| `table` | 表格 | `children` |
| `row` | 表格行 | `role`、`children` |
| `cell` | 表格单元格 | `text` 或 `children` |
| `chart` | 统计图表 | `chartType`、`categories`、`series`、坐标轴 |
| `geometry` | 几何图 | 点、线、圆、多边形和条件等 |
| `icon` | 内置图标 | `name`、`alt` |

上表共 **13 种类型**；独立 `latex` 已合并，`paragraph` 是否彻底移除见后续优化规划。

## 3. text：文字与公式

```json
{
  "id": "text_1",
  "type": "text",
  "version": 1,
  "text": "已知 \\(a=3\\)、\\(b=4\\)。\n求 \\(a+b\\) 的值。"
}
```

所有类型的 `text` 字段采用相同规则，包括 `option.text`、`subquestion.text` 和 `cell.text`：

| 内容 | 解析后的字符串写法 | JSON 中的写法 |
|---|---|---|
| 行内公式 | `\(a+b\)` | `"\\(a+b\\)"` |
| 独立公式 | `\[a+b=c\]` | `"\\[a+b=c\\]"` |
| 文字换行 | 换行字符 | `"第一行\n第二行"` |
| 公式内部换行 | 多行环境中的 `\\` | 字符串内写 `\\\\` |

普通文字不解释为 HTML。独立公式分隔符决定公式单独成行；不等同于公式内部换行，也不强制居中。

多行公式示例：

```json
{
  "id": "text_formula",
  "type": "text",
  "version": 1,
  "display": {"align": "center"},
  "text": "\\[\\begin{aligned}a &= 3+4 \\\\ &= 7\\end{aligned}\\]"
}
```

`aligned` 中的 `&` 控制公式各行的内部对齐，外部 `display.align` 控制整组公式的位置。实现需使用明确支持的 LaTeX 子集，不承诺完整 TeX 编译能力。

## 4. blank：一个作答空

```json
{
  "id": "blank_1",
  "type": "blank",
  "version": 1,
  "display": {"widthEm": 5}
}
```

`widthEm` 表示相对于当前字号的宽度：字号为 16px 时，5em 约为 80px。建议默认 5em；具体数值范围见第 12 节。

每个空单独保存 ID，不使用普通空格或连续下划线代替。一个题目可以有多个 `blank`，答案模块将来通过 ID 关联答案。正确答案和学生作答不存入该节点。

## 5. options / option：选项组与选项

```json
{
  "id": "options_1",
  "type": "options",
  "version": 1,
  "mode": "single",
  "display": {"columns": 2},
  "children": [
    {"id": "opt_1", "type": "option", "version": 1, "text": "\\(0.25\\)"},
    {"id": "opt_2", "type": "option", "version": 1, "text": "\\(0.5\\)"},
    {"id": "opt_3", "type": "option", "version": 1, "text": "\\(0.75\\)"},
    {"id": "opt_4", "type": "option", "version": 1, "text": "\\(1\\)"}
  ]
}
```

- `mode` 在顶层，取 `single` 或 `multiple`。
- `display.columns` 取 `1`、`2` 或 `4`，表示期望列数。
- `options.children` 只接受 `option`。
- A、B、C、D 按顺序自动生成，不单独保存标签。
- 答案引用稳定选项 ID，不能依赖显示字母。
- 简单选项使用 `text`；组合选项使用 `children`，二者互斥。

图片选项示例：

```json
{
  "id": "opt_picture",
  "type": "option",
  "version": 1,
  "children": [
    {"id": "opt_caption", "type": "text", "version": 1, "text": "观察下图："},
    {
      "id": "opt_image",
      "type": "image",
      "version": 1,
      "assetId": "asset_triangle",
      "alt": "直角三角形",
      "display": {"align": "center", "widthPercent": 100}
    }
  ]
}
```

## 6. subquestions / subquestion：小问组与小问

结构对应 `options / option`，但不具有单选、多选的 `mode`。

```json
{
  "id": "subquestions_1",
  "type": "subquestions",
  "version": 1,
  "children": [
    {
      "id": "subq_1",
      "type": "subquestion",
      "version": 1,
      "text": "说明你的解题思路。"
    },
    {
      "id": "subq_2",
      "type": "subquestion",
      "version": 1,
      "children": [
        {"id": "text_calc", "type": "text", "version": 1, "text": "计算 \\(3+4=\\)"},
        {"id": "blank_result", "type": "blank", "version": 1, "display": {"widthEm": 5}},
        {"id": "text_period", "type": "text", "version": 1, "text": "。"}
      ]
    }
  ]
}
```

- `subquestions.children` 只接受 `subquestion`，小问默认上下排列。
- 自动按同组顺序生成“（1）”“（2）”，不写进正文。
- 简单小问使用 `text`；复杂小问使用 `children`，二者互斥。
- 小问中的文字与填空连续排列，不需要 `paragraph`。
- 首版不支持小问组嵌套小问组。
- 共享题干、图片放在小问组外，避免复制到每个小问。

## 7. image：图片

```json
{
  "id": "image_1",
  "type": "image",
  "version": 1,
  "assetId": "asset_triangle",
  "alt": "直角三角形 ABC，角 C 为直角",
  "display": {"align": "center", "widthPercent": 60}
}
```

| 字段 | 含义 |
|---|---|
| `assetId` | 引用 `bank_asset` 图片资产 |
| `alt` | 无障碍及加载失败时的文字描述，不是可见图注 |
| `display.align` | `left` 或 `center`，默认 `center` |
| `display.widthPercent` | 父容器可用宽度的百分比，默认 60 |

图片保持原始宽高比，不存固定显示高度。在选项内的 100% 指该选项的内容宽度。

图片字节存资产表，不把 Base64、本机路径或临时预览 URL 存在 Block 中。建议资产表增加 `mime_type`，区分 PNG 与 SVG。SVG 保存前需清理脚本、事件属性、外部引用及 `foreignObject`；首版已实现 PNG 和经过白名单校验的 SVG 资产保存。

裁剪后创建新资产，Block 引用结果。可见图注单独使用 `text`。外部 SVG 使用 `image`；可编辑点线的图形使用 `geometry`。

## 8. table / row / cell：表格

```json
{
  "id": "table_1",
  "type": "table",
  "version": 1,
  "display": {"align": "center", "widthPercent": 100},
  "children": [
    {
      "id": "row_header", "type": "row", "version": 1, "role": "header",
      "children": [
        {"id": "cell_h1", "type": "cell", "version": 1, "text": "小组"},
        {"id": "cell_h2", "type": "cell", "version": 1, "text": "人数"}
      ]
    },
    {
      "id": "row_1", "type": "row", "version": 1,
      "children": [
        {"id": "cell_1", "type": "cell", "version": 1, "text": "第一组"},
        {"id": "cell_2", "type": "cell", "version": 1, "text": "6"}
      ]
    },
    {
      "id": "row_2", "type": "row", "version": 1,
      "children": [
        {"id": "cell_3", "type": "cell", "version": 1, "text": "第二组"},
        {
          "id": "cell_4", "type": "cell", "version": 1,
          "children": [
            {"id": "blank_count", "type": "blank", "version": 1, "display": {"widthEm": 3}}
          ]
        }
      ]
    }
  ]
}
```

- `table` 只包含 `row`，`row` 只包含 `cell`，顺序决定行列位置。
- `row.role: "header"` 表示表头；省略表示普通行。
- `cell` 使用 `text` 或 `children`，二者互斥。空单元格使用 `text: ""`。
- 首版各行列数一致，不支持合并单元格、嵌套表格或电子表格公式计算。
- 表格默认宽度 100%，整表居中；表头内容默认居中，普通单元格默认左对齐。
- 单元格的 `display.align` 控制单元格内容，整表的同名属性只控制表格位置。

## 9. chart：统计图表

```json
{
  "id": "chart_1",
  "type": "chart",
  "version": 1,
  "chartType": "bar",
  "alt": "四个阅读小组的人数统计",
  "display": {"align": "center", "widthPercent": 60},
  "categories": ["第一组", "第二组", "第三组", "第四组"],
  "series": [
    {"id": "series_1", "name": "人数", "values": [6, 8, 5, 9]}
  ],
  "xAxis": {"title": "阅读小组"},
  "yAxis": {"title": "人数", "unit": "人", "min": 0}
}
```

- 首版 `chartType` 为 `bar`（分组柱状图）或 `line`（折线图）。
- `categories` 定义分类及顺序，不代表连续数值坐标。
- `series` 可以有多组数据；每组 `values` 数量必须等于分类数量。
- 数值必须是有限数字，不能保存为 `"6人"`；单位独立保存。
- `series.id` 在该图表内唯一；`name` 用于图例，颜色由主题统一分配。
- `yAxis.min` 可省略，由渲染器自动确定；柱状图坐标范围必须包括零基线，且不能截掉实际数值。
- 第一版不支持缺失值、堆叠、双纵轴、饼图和散点图。
- 高度按默认宽高比计算；可见标题及图注使用相邻 `text`。
- 不使用 `children`；保存数值，由渲染器生成 SVG，不保存柱子的绘图坐标。

## 10. geometry：几何图形

```json
{
  "id": "geometry_1",
  "type": "geometry",
  "version": 1,
  "alt": "直角三角形 ABC，角 A 为直角，AB 为 4，AC 为 3",
  "display": {"align": "center", "widthPercent": 60},
  "coordinateSystem": "screen",
  "viewBox": [0, 0, 320, 260],
  "points": {
    "A": {"x": 60, "y": 200, "label": "A", "dx": -18, "dy": 18},
    "B": {"x": 260, "y": 200, "label": "B", "dx": 8, "dy": 18},
    "C": {"x": 60, "y": 50, "label": "C", "dx": -18, "dy": -8}
  },
  "segments": [
    {"id": "AB", "from": "A", "to": "B"},
    {"id": "AC", "from": "A", "to": "C"},
    {"id": "BC", "from": "B", "to": "C"}
  ],
  "rightAngles": [{"vertex": "A", "arms": ["B", "C"], "size": 12}],
  "labels": [
    {"x": 160, "y": 222, "text": "4"},
    {"x": 40, "y": 125, "text": "3"}
  ],
  "givens": [
    {"type": "length", "segment": "AB", "value": 4},
    {"type": "length", "segment": "AC", "value": 3},
    {"type": "perpendicular", "segments": ["AB", "AC"]}
  ]
}
```

| 字段 | 含义 |
|---|---|
| `coordinateSystem` | 首版为 `screen`，x 向右、y 向下 |
| `viewBox` | `[左边界, 上边界, 宽, 高]`，宽高为正 |
| `points` | 点 ID 到坐标、名称、名称偏移的映射 |
| `segments` | 两个点之间的线段；`dashed: true` 表示虚线 |
| `circles` | 圆，例如 `{"id":"circle_1","center":"O","radius":80}` |
| `polygons` | 多边形，例如 `{"points":["A","B","C"],"fill":"shade"}` |
| `rightAngles` | 直角标记的顶点、两臂上的点和符号尺寸 |
| `labels` | 指定位置的纯文字标签，首版不解析 LaTeX |
| `givens` | 数学给定条件，如长度、垂直关系 |

点和线段 ID 在所属几何图内唯一，引用必须存在。没有内容的集合可以省略。不使用 `children`，几何数据不是 Block。

绘图长度与数学长度不同：示例 AB 绘图长度为 200，数学条件为 4。`givens` 不自动求解，也不自动生成标签；编辑器需同步维护相关条件与可见标注，避免不一致。首版标签与条件尚无显式关联 ID，实现时需明确编辑操作如何完成同步。

`viewBox` 定义内部坐标范围，`display.widthPercent` 控制页面显示大小。复杂公式放图外的 `text`。

## 11. icon：内置图标

```json
{
  "id": "icon_1",
  "type": "icon",
  "version": 1,
  "name": "warning",
  "alt": "注意",
  "display": {"sizeEm": 1}
}
```

- `name` 来自内置白名单，首版为 `info`、`warning`、`check`。
- `alt` 为文字描述，纯装饰图标可为空。
- `sizeEm` 默认 1，表示相对于当前字号的尺寸。
- 图标与相邻文字、填空连续排列，默认垂直居中，颜色跟随文字。
- 不使用 `text` 或 `children`；自定义 SVG 使用 `image`，数学符号使用 LaTeX。

## 12. 已确定的排版行为与后续优化规划

### 12.1 已确定的排列行为

相邻 `text`、`blank`、`icon` 连续排列，空间不足时自动换行。图片、几何图、统计图表、表格和组容器独立成块。独立公式在文字内部单独成行，文字主动换行使用 `\n`。

`widthPercent` 总是相对于直接父容器的可用内容宽度；不是相对于屏幕。预览和打印可以有不同绝对宽度，但使用相同百分比。

### 12.2 后续优化规划（暂不在代码中体现）

本节全部内容仅记录后续优化方向，不纳入本轮代码实现、校验规则或验收标准，也不要求为这些规划预先增加抽象或配置。各类型前文已明确的行为继续作为当前设计依据；本节不撤销已有约束，也不要求删除现有校验。

1. 后续评估是否彻底移除 `paragraph`，统一由组合容器处理连续行内节点。
2. `option`、`subquestion`、`cell` 的 `display.align` 控制连续内容的默认对齐。连续内容中的子 `text` 不单独改变对齐；独立 `text` 块可设置自身对齐。图片等块使用自己的对齐设置。
3. 题目根层也使用同样的连续排列规则，使没有小问的填空题可直接由 `text + blank + text` 组成。
4. 不为所有对象开放任意样式字段，只允许该类型支持的参数。

后续可考虑统一为以下父子约束矩阵；本轮不新增按此矩阵统一校验的机制，各类型已明确的直接子类型规则仍保留：

| 父容器 | 允许的直接子类型 |
|---|---|
| 题目根 `blocks` | `text`、`blank`、`icon`、`image`、`geometry`、`chart`、`table`、`options`、`subquestions` |
| `options` | `option` |
| `subquestions` | `subquestion` |
| `option` | `text`、`blank`、`icon`、`image`、`geometry`、`chart`、`table` |
| `subquestion` | `text`、`blank`、`icon`、`image`、`geometry`、`chart`、`table`、`options` |
| `table` | `row` |
| `row` | `cell` |
| `cell` | `text`、`blank`、`icon`、`image` |

`text`、`blank`、`icon`、`image`、`geometry`、`chart` 不接受子 Block。禁止递归嵌套选项组、小问组或表格。

建议默认值：选项列数 1；文字左对齐；独立公式未指定对齐时居中；图片、几何图、图表居中且宽度 60%；表格居中且宽度 100%。显式对齐配置优先于默认值。上述默认值的统一管理、公式默认值及继承优先级列入后续规划，暂不据此新增代码行为。各类型此前已明确的默认值不受影响。

建议参数范围：`widthPercent` 为 20～100 的整数，`widthEm` 为 3～24 的数值，`sizeEm` 为 0.5～4 的数值。这些建议范围及其集中配置列入后续规划，本轮不据此新增或修改校验，现有校验不受影响。

## 13. 题目存储与完整示例

建议继续使用现有三张业务表，不单独为 Block 建表：

- `bank_question`：题目普通属性和 `content` JSON。
- `bank_asset`：图片二进制及建议增加的 `mime_type`。
- `worksheet`：组卷的完整题目快照及作答行数。

题目外壳沿用此前草案建议：`schemaVersion: 2` 表示本次新格式；`sourceNumber`、`tags`、`blocks`、`warnings` 保存在 `content`。`subject`、`kind`、`source` 等使用题目普通列。外壳命名及是否消除属性重复存储尚未在逐类型讨论中单独确认，属于存储层建议。

下面是 `content` 的完整示例，包含选择小问和两个作答空：

```json
{
  "schemaVersion": 2,
  "sourceNumber": "1",
  "tags": ["基础运算"],
  "blocks": [
    {"id": "intro", "type": "text", "version": 1, "text": "根据要求回答下列问题。"},
    {
      "id": "parts", "type": "subquestions", "version": 1,
      "children": [
        {
          "id": "part_choice", "type": "subquestion", "version": 1,
          "children": [
            {"id": "choice_prompt", "type": "text", "version": 1, "text": "下列哪个数等于 \\(\\frac{1}{2}\\)？"},
            {
              "id": "choices", "type": "options", "version": 1,
              "mode": "single", "display": {"columns": 2},
              "children": [
                {"id": "answer_a", "type": "option", "version": 1, "text": "\\(0.25\\)"},
                {"id": "answer_b", "type": "option", "version": 1, "text": "\\(0.5\\)"}
              ]
            }
          ]
        },
        {
          "id": "part_fill", "type": "subquestion", "version": 1,
          "children": [
            {"id": "fill_prompt", "type": "text", "version": 1, "text": "计算：\\(3+4=\\)"},
            {"id": "blank_sum", "type": "blank", "version": 1, "display": {"widthEm": 5}},
            {"id": "fill_middle", "type": "text", "version": 1, "text": "，\\(3\\times4=\\)"},
            {"id": "blank_product", "type": "blank", "version": 1, "display": {"widthEm": 5}},
            {"id": "fill_end", "type": "text", "version": 1, "text": "。"}
          ]
        }
      ]
    }
  ],
  "warnings": []
}
```

`warnings` 是编辑者的识别提醒，不作为试卷正文。答案 B、7、12 不写入这些展示节点。答案、解析、分值、学生作答和作答区域属于后续模块，本文未定义其存储结构。

组卷需保存完整内容及排版参数，题库后续修改不影响已有快照。图片引用的资产应保持不可变，替换图片创建新资产，清理前检查题库与试卷引用。

## 14. 校验与实现约束

对应实现见 `blocks.schema.json`、`content.py`、`bank.py`。以下条目记录设计要求；其中统一容量和深度上限仍为后续规划，不因本节被提前实施：

1. 按 `type` 校验字段，拒绝未知类型、未知版本和无效字段，不静默丢失内容。
2. `option`、`subquestion`、`cell` 必须且只能具有 `text`、`children` 之一。空单元格允许 `text: ""`；是否允许空选项等应另设业务约束。
3. 校验 Block ID 唯一、几何引用存在、图表长度一致、表格列数一致、资产引用有效及归属正确。
4. 后端负责最终校验，前端负责即时提示；错误应指明节点路径。
5. 设置题目总大小、节点数、嵌套深度、图片大小与 SVG 复杂度上限。
6. 保存时补齐正式确定的排版默认值，使后续默认值变化不影响已保存题目及快照。
7. 编辑器选中状态、上传进度、临时 URL、撤销栈不进入题目内容。
8. 题库、编辑预览和组卷使用同一套节点渲染规则。

新版不读取旧格式数据库，不实现旧版迁移或兼容。浏览器预览、入库和组卷已接入本格式；真实模型识别准确率仍需使用实际图片验证。
