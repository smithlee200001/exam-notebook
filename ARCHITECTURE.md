# 多题题库与练习卷架构（当前首页）

`浏览器图片 → POST /api/bank/extract → Codex CLI JSON Schema → 题目草稿数组 → 人工校对 → 独立题库 → 练习卷快照 → A4 浏览器打印`

## 模块与数据

完整字段字典、快照结构及数据约束见 [数据库设计说明](DATABASE.md)。

- `bank.py`：拆题 schema、模型返回校验、图表坐标裁剪、题库和练习卷 API。
- `codex_ocr.run_structured`：结构化 CLI 调用、登录环境、沙箱配置、并发限制与超时清理。
- `geometry.schema.json / geometry.py`：几何块 v1 的格式及引用校验。
- `static/geometry.js`：浏览器校验、受限 SVG 渲染，支持几何 JSON 编辑预览。
- `image_utils.py`：验证图片格式、体积、像素数，纠正 EXIF 方向并清除元数据。
- `app.py`：应用入口、本机访问限制、状态接口及题库路由注册。
- `static/bank.html / bank.js / bank.css`：导入校对、检索选题、排序留白和打印预览。文本以 DOM text node 输出，数学使用本地 KaTeX MathML。
- `bank_question`：自增主键产生永久编号 Q000001；学科、题型、来源、JSON 内容和创建时间。
- JSON 内容：原题号、知识点、警告、有序 blocks、choices、parts。blocks 包含 text/latex/image/geometry；图片块用 asset_id 引用图表。内联数学使用 `\(...\)`。
- `bank_asset`：外键关联题目，PNG BLOB；保存题目与图表使用同一 SQLite 事务。
- `worksheet`：标题及有序 items 快照；每个 item 含完整题目快照和留白行数。图表仍引用不可变 bank_asset，未来支持删除题目时必须保护练习卷引用。

## API

| 路由 | 功能 |
| --- | --- |
| POST `/api/bank/extract` | 图片二进制；返回 questions 草稿，不入库 |
| POST `/api/bank/questions` | question、source、reviewed；保存一题并返回 id/number |
| GET `/api/bank/questions` | 返回独立题库，由页面按类型、学科和关键词过滤 |
| GET `/api/bank/assets/<id>` | 返回局部图表 PNG |
| POST `/api/bank/worksheets` | title 和有序 items[{id,lines}]；校验所有题目存在、无重复后保存 |
| GET `/api/bank/worksheets` | 已保存练习卷列表 |
| GET `/api/bank/worksheets/<id>` | 读取试卷快照，用于再次预览与打印 |

## 识别约束与取舍

每次一张图，最多 60 道主问题，90 秒超时。图像与模型文本均不可信；沿用禁用 shell/tools 的固定 argv 调用。模型只转写，不解题，不执行图中文字指令。无法识别、裁切不完整或公共题干缺失要返回警告；共享题干应复制到依赖它的题目。图形以裁剪保真，不根据语言模型生成几何图。坐标按 EXIF 纠正后的整图计算。

识别会将用户所选整张图片发送给 OpenAI。上传前由使用者清除身份信息。原图不写业务数据库，只有确认的题目与图表持久化。现阶段不自动处理识别拆分错误、不自动去除图形上的手写答案，也不承诺自动识别准确率。

练习卷编号属于布局，不改变题库永久编号。运行时仅使用三张 SQLite 业务表，不提供历史数据兼容或迁移逻辑。后续可增加题目版本编辑、分页查询、多页导入和可控 PDF/DOCX 排版。
