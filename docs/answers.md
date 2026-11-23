# 题目答案数据设计草案

状态：**首版已实现**。本文在现有 [Block 设计](blocks.md) 和 [数据库结构](database.md) 上增加标准答案与解析，题干格式保持不变。实现见 `notebook/domain/answers.py`、`notebook/schemas/answer.schema.json`、`static/js/answers.js`，示例见 [examples.md](examples.md)。

## 1. 设计目标与范围

题干描述“问什么”，答案描述“如何回答”。两者独立保存，通过稳定的内容节点 ID 关联。一个题目可以有一个选择答案、多个填空答案、多个小问的解答，也可以混合这些形式。

首版建议包括：

- 每题一份答案文档，支持部分录入。
- 单选、多选、填空、解答三类答案数据。
- 标准答案与可选解析；解答、解析复用已有展示 Block。
- 保存答案时校验目标节点与选项引用。
- 组卷保存答案快照，普通试卷与答案页分别渲染。

不包含学生作答记录、自动判分、分值、评分细则、答案历史版本或自动求解。这些是后续模块，不能把标准答案表同时当成学生作答表。

## 2. 数据库位置与新表

继续使用当前 SQLite 数据库，默认路径：

```text
data/blocks-v2/notebook.sqlite3
```

目录优先级沿用 `create_app(data_dir)` > `EXAM_DATA_DIR` > 默认目录。

在现有三张业务表之外新增 `bank_answer`：

```sql
CREATE TABLE IF NOT EXISTS bank_answer (
    question_id INTEGER PRIMARY KEY
        REFERENCES bank_question(id),
    content TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `question_id` | INTEGER，主键、外键 | 对应 `bank_question.id`；每题最多一份答案文档 |
| `content` | TEXT | 序列化的答案 JSON |
| `updated_at` | TEXT | 最近保存时间，SQLite UTC 时间 |

建表由 `notebook/storage/database.py` 的 `initialize()` 读取 `schema.sql` 完成。创建表不会为所有题目自动生成答案。没有记录表示尚未录入答案。

更新答案时，应用必须同时设置 `updated_at = CURRENT_TIMESTAMP`；默认值只负责首次插入，不会自动随 UPDATE 更新。

不增加独立的答案自增 ID，不为每个空或选项另建表。题目与答案是一对零或一的关系，答案内部的多个作答目标由 JSON 数组表达。

首版不设置级联删除。未来增加题目删除时，应显式处理答案、图片及练习卷快照引用，不能简单删除被试卷引用的资源。

## 3. 答案文档外壳

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "target": "block",
      "targetId": "options_1",
      "type": "choice",
      "optionIds": ["opt_2"]
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `schemaVersion` | integer | 答案格式版本，首版固定为 `1` |
| `entries` | array | 此题所有已录入的答案项 |

答案格式版本与题目 `schemaVersion: 2` 独立，两者不需要相同。`question_id` 已在普通列中，不在 JSON 内重复存储。

`entries` 的数组顺序不用于定位作答目标，也不决定答案页顺序。答案页依据题目当前内容树或练习卷题目快照的顺序显示。

## 4. 答案项与目标关联

每个答案项包含公共定位字段和类型专属字段，不使用额外的 `data` 包装。

| 字段 | 类型 | 说明 |
|---|---|---|
| `target` | `"block"` 或 `"question"` | 指向题目中的一个节点，或者整道题 |
| `targetId` | string | `target: "block"` 时必填；指向题目 Block 的 `id` |
| `type` | `"choice"`、`"fill"`、`"solution"` | 标准答案种类 |
| `explanation` | Block 数组，可省略 | 补充解析，可包含文字、公式、图片、表格等 |

`target: "question"` 时不填写 `targetId`。它只用于没有细分作答目标的整题解答。

| 作答内容 | 目标节点 | 答案类型 |
|---|---|---|
| 单选或多选 | `options.id` | `choice` |
| 一个作答空 | `blank.id` | `fill` |
| 开放式解答小问 | `subquestion.id` | `solution` |
| 没有小问的整题解答 | `target: "question"` | `solution` |

不使用 A/B/C、“第一个空”或“第（2）问”作为数据库关联键。这些显示序号会随排列变化，ID 保持稳定。

每个目标最多一个答案项。答案项无需单独的 `id`，由所在题目及目标唯一确定。

## 5. choice：单选与多选

单选示例：

```json
{
  "target": "block",
  "targetId": "options_1",
  "type": "choice",
  "optionIds": ["opt_2"],
  "explanation": [
    {
      "id": "explain_choice_1",
      "type": "text",
      "version": 1,
      "text": "因为 \\(\\frac{1}{2}=0.5\\)，所以选择对应选项。"
    }
  ]
}
```

多选示例：

```json
{
  "target": "block",
  "targetId": "options_prime",
  "type": "choice",
  "optionIds": ["opt_1", "opt_2", "opt_4"]
}
```

规则：

- 单选、多选模式从目标 `options.mode` 读取，不重复保存在答案中。
- `single` 必须且只能有一个正确选项；`multiple` 至少有一个。
- `optionIds` 不得重复，全部必须属于目标选项组，不能引用其他小问的选项。
- 多选答案按集合理解，不依赖 `optionIds` 的排列。
- 答案页根据题目或快照中的选项顺序，将 ID 映射为显示字母。

例如 `opt_2` 原为 B，移动到第一项后显示为 A，答案仍然引用 `opt_2`。已有练习卷使用自己的题目快照，所以仍按原顺序显示 B。

## 6. fill：一个空的标准答案

```json
{
  "target": "block",
  "targetId": "blank_fraction",
  "type": "fill",
  "text": "\\(\\frac{1}{2}\\)",
  "alternatives": ["0.5", "50%"]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `text` | string | 标准答案，支持普通文字与 LaTeX |
| `alternatives` | string 数组 | 其他可接受表达；可省略，按空数组处理 |
| `explanation` | Block 数组 | 可选解析 |

每个空分别保存答案，宽度和位置仍由题干中的 `blank` 定义。一个题有三个空，就有三个关联不同 `blank.id` 的答案项。

`text` 与 `alternatives` 都是展示表达，不是可执行数学表达式。首版不会自动判断 `0.5` 与 `1/2` 的数学等价性，不根据列出的表达自动判分。

首版也不定义“多个空的答案可互换”规则。例如“填两个质数”不是两个独立固定值就能完整描述的判分任务，需人工核查，后续再设计跨空约束。

## 7. solution：解答题或解答小问

```json
{
  "target": "block",
  "targetId": "subq_length",
  "type": "solution",
  "blocks": [
    {
      "id": "solution_intro",
      "type": "text",
      "version": 1,
      "text": "由勾股定理可得："
    },
    {
      "id": "solution_formula",
      "type": "text",
      "version": 1,
      "display": {"align": "center"},
      "text": "\\[BC=\\sqrt{3^2+4^2}=5\\]"
    }
  ]
}
```

`blocks` 是标准解答内容，必须包含有效内容。直接复用展示 Block，不创建新的“答案公式”“答案图片”类型。

没有小问的整道解答题：

```json
{
  "target": "question",
  "type": "solution",
  "blocks": [
    {
      "id": "whole_solution",
      "type": "text",
      "version": 1,
      "text": "设未知数为 \\(x\\)，由题意可得 \\(3x+5=20\\)，解得 \\(x=5\\)。"
    }
  ]
}
```

`blocks` 表示标准解答本身，`explanation` 表示额外思路、易错点等说明，不要求重复填写。

首版建议答案正文及解析允许 `text`、`image`、`geometry`、`chart`、`table`、`icon`，表格内部复用 `row/cell`。不在答案中添加新的 `blank`、`options` 或 `subquestions`，避免答案再次变成待作答题目。

答案中的所有 Block ID 在整份答案文档内唯一，包含各项正文和解析的嵌套节点。它们与题干 Block ID 属于不同作用域，不能被当成 `targetId`。

## 8. 一道组合题的完整答案

假设题目包含：

```text
subquestions_1
├── subq_choice
│   └── options_1：opt_1、opt_2、opt_3、opt_4
├── subq_fill
│   ├── blank_perimeter
│   └── blank_area
└── subq_reason：说明面积计算过程
```

对应 `bank_answer.content`：

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "target": "block",
      "targetId": "options_1",
      "type": "choice",
      "optionIds": ["opt_2"]
    },
    {
      "target": "block",
      "targetId": "blank_perimeter",
      "type": "fill",
      "text": "\\(28\\)",
      "alternatives": []
    },
    {
      "target": "block",
      "targetId": "blank_area",
      "type": "fill",
      "text": "\\(48\\)",
      "alternatives": []
    },
    {
      "target": "block",
      "targetId": "subq_reason",
      "type": "solution",
      "blocks": [
        {
          "id": "solution_area",
          "type": "text",
          "version": 1,
          "text": "长方形的面积为长乘宽，因此 \\(S=8\\times6=48\\)。"
        }
      ]
    }
  ]
}
```

选择小问关联内部的 `options`，填空小问关联内部的各个 `blank`，不再为这些小问额外保存一条重复的 `solution`。

建议首版避免重叠答案目标：若小问内含选项组或填空，则使用其具体作答节点，解析附在对应答案项；整题 `solution` 仅在题目没有独立作答目标时使用。整题综合解析、跨空答案关系等留待后续设计。

## 9. 未录入与部分录入

- 没有 `bank_answer` 记录：整题未录入答案，接口返回 `answer: null`。
- 已有记录但只覆盖部分作答目标：部分录入，保留已有条目，提示缺少哪些目标。
- 选择项或填空答案不能为空，不用空字符串冒充已录入答案。
- 建议首次保存至少一个有效答案项；明确清空整题答案时删除该题答案记录，不存一个含义不明的空文档。

“未录入/部分录入/已完整录入”根据当前题目结构推导，不单独持久化一个易失效的状态字段。选择题和填空题的目标可由节点类型识别；自由解答题按整题或开放式小问定位。当前识别规则：选项组视为一个目标，不继续识别选项内部的空；小问内有独立目标时使用那些目标，否则小问为解答目标；无任何局部目标时使用整题解答。表格中的空按遍历顺序编号。

## 10. 解析图片与资产复用

答案、解析中的 `image` 继续引用 `bank_asset`，不再另建图片表，也不在答案 JSON 中嵌入 Base64。

- 新上传的答案图片归属同一 `question_id`。
- 允许答案引用该题已有资产，例如复用题干中的几何示意图片。
- 不允许直接引用其他题目的资产；复制题目时应复制所需资产并更新引用。
- 替换图片创建新资产，不原地覆盖；防止已有练习卷快照变化。
- 答案 JSON 与新资产必须在同一事务保存，失败全部回滚。
- 清理资产时同时检查题干、答案及所有练习卷快照的引用。

图片上传可以沿用当前 `assets` 传输映射，但它只属于请求载荷，不进入 `bank_answer.content`。

## 11. 保存与校验

建议提供专用的答案 Schema 与验证入口，不把答案包装成一个虚构题目来复用题目校验器。展示 Block 的结构校验可以复用。

保存过程：读取当前题目 → 建立节点 ID 索引 → 校验答案文档和引用 → 校验图片 → 同事务保存答案及资产 → 更新时间。

需要检查：

1. `question_id` 指向真实题目。
2. 文档版本和答案类型受支持，不接受未知字段。
3. 每个 `targetId` 在题目中存在且类型匹配；目标不能重复。
4. 正确选项属于目标选项组，并符合单选/多选数量要求。
5. 标准答案和解答内容有效，解析使用允许的展示 Block。
6. 答案内 Block ID 不重复；图片引用有效且归属正确。
7. 不存在整题与局部目标的重复覆盖。

错误应包含字段路径，例如 `entries[0].optionIds[1]`，并说明“选项不属于 options_1”。禁止静默删掉失效答案后报告保存成功。

当前应用没有已入库题目编辑功能。未来加入该功能时，题目内容改动也必须重新校验已有答案：文字修改及排序保留 ID；删除空格、删除正确选项、修改单选/多选模式等操作必须明确提示并同步处理答案，不能按位置自动猜测对应关系。

## 12. 建议接口

以下接口已实现：

| 方法与路径 | 用途 |
|---|---|
| `GET /api/bank/questions/<id>/answer` | 获取答案及更新时间；题目存在但没有答案时返回 `answer: null` |
| `PUT /api/bank/questions/<id>/answer` | 完整保存或替换这一题的答案；请求含 `answer` 和可选 `assets` |
| `DELETE /api/bank/questions/<id>/answer` | 用户明确清空答案时使用；不删除已保存试卷的答案快照 |

不存在的题目返回 404，答案格式或引用错误返回 400。PUT 是整份替换，未提交的旧条目不会被自动合并保留；编辑器应先加载完整文档再修改。

题库列表不必默认附带完整答案，编辑答案或查看答案时单独读取。后续若支持多人编辑，需要额外的修订号与冲突处理，不能只依靠更新时间实现并发控制。

## 13. 组卷答案快照

将新练习卷的每个 `items` 元素扩展为：

```text
worksheet.items[]
├── question：组卷时的完整题目快照
├── answer：组卷时的完整答案文档；没有答案时为 null
└── lines：作答留白行数
```

题目和答案应在同一个数据库读事务中获取，保证快照对应。`answer.targetId` 指向同一项 `question` 快照中的节点，而不是实时查询题库内容。

- 普通试卷只渲染 `question`。
- 答案页按试卷题号及题目内部顺序渲染 `answer`。
- 题库答案后续修改，不影响已有试卷。
- 组卷时没有答案的题目保留 `null`；以后录入答案也不自动补入旧试卷。
- 部分答案可以随卷保存，答案页应提示未录入部分，不能假装完整。

已有不含答案快照的练习卷不回填，答案页显示未录入。创建新练习卷时才会读取当前答案快照。

当前是本机应用。若未来增加学生端，应由后端控制答案访问权限，不能把答案发给学生浏览器后仅通过 CSS 隐藏。

## 14. 建议实现顺序与验证示例

1. 新增答案表、答案 Schema、引用校验和读写接口。
2. 按题目目标提供答案编辑：选择正确选项、逐空填写、解答与解析编辑。
3. 支持答案图片，复用现有展示渲染器。
4. 组卷增加答案快照和独立答案页。

至少验证以下场景：

| 场景 | 预期 |
|---|---|
| 单选题 | 只能保存一个属于该组的正确选项 |
| 多选题 | 多个 ID 无重复，显示字母按题目顺序生成 |
| 多空填空题 | 每个空独立关联，不因调换位置串答案 |
| 组合小问 | 同时包含 choice、fill、solution |
| 解答含公式、表格或图片 | 展示与题干共用渲染，资产可重新读取 |
| 删除或替换目标节点 | 校验指出失效引用，不静默忽略 |
| 保存失败 | 答案及新资产均不部分落盘 |
| 先组卷，再修改题库答案 | 已有试卷答案保持原样 |
| 组卷时答案不完整 | 快照保留已有答案并提示缺失 |

后续再规划：数学等价判分、容差和单位、跨空约束、评分点与分值、学生作答记录、答案修订历史、整题综合解析及多人并发编辑。

## 15. 当前操作方式

- 点击“体验 16 题示例”，题面下方展开“查看答案与解析”。右侧展开“编辑答案与解析”可修改；校对保存题目时答案一并保存。
- 题库每张卡片提供“查看 / 编辑答案”，支持单独保存答案、清空某项和明确清空整题答案。
- 标准解答、解析支持文字和 LaTeX；复杂内容可编辑 Block JSON，并可向解析上传 PNG/SVG 图片。
- 新练习卷保存题目和答案快照，显示下拉框可选择仅题目、仅答案与解析、题目及独立答案页。打印内容跟随选择。
- `POST /api/bank/answers/validate` 提供独立答案校验；题目预览也联合校验答案。
- `scripts/supplement_example_answers.py` 只为与内置示例完全匹配且没有答案的已存题目补充答案，不覆盖用户已有答案，不回填练习卷。

本版未实现自动判分，开放题、其他可接受表达及多个空之间的关系需要人工核查。
