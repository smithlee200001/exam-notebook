# 多题题库与练习卷架构（当前首页）

`浏览器图片 → POST /api/bank/extract → Codex CLI JSON Schema → 题目草稿数组 → 人工校对 → 独立题库 → 练习卷快照 → A4 浏览器打印`

## 模块与数据

- `bank.py`：拆题 schema、模型返回校验、图表坐标裁剪、题库和练习卷 API。
- `codex_ocr.run_structured`：复用已有 CLI 参数、登录、只读环境、并发限制与超时清理；旧 `recognize` 仍返回单 text。
- `static/bank.html / bank.js / bank.css`：导入校对、检索选题、排序留白和打印预览。文本以 DOM text node 输出，数学使用本地 KaTeX MathML。
- `bank_question`：自增主键产生永久编号 Q000001；学科、题型、来源、JSON 内容和创建时间。
- JSON 内容：原题号、知识点、警告、有序 blocks、choices、parts。blocks 包含 text/latex/image；图片块用 asset_id 引用图表。内联数学使用 `\(...\)`。
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

新流程允许将整页发送给 OpenAI；这与旧工作台的单题选区边界不同。上传前由使用者清除身份信息。原图不写业务数据库，只有确认的题目与图表持久化。现阶段不自动处理识别拆分错误、不自动去除图形上的手写答案，也不承诺自动识别准确率。

练习卷编号属于布局，不改变题库永久编号。保留旧 SQLite 表与原文件；新版不依赖 PostgreSQL 参考 `schema.sql`，不自动迁移历史数据。后续可增加题目版本编辑、分页查询、多页导入和可控 PDF/DOCX 排版。

---

以下为历史单题工作台设计，描述旧 `/single` 页面及旧 API；与新首页冲突时以上述多题架构为准。

# 当前默认路径：独立练习题

整页照片只在浏览器内存中解码和预览。选区以原始二进制发送到 `/api/practice/ocr`，后端解码并清除元数据后，在私有临时目录调用复用当前用户登录的 Codex CLI（忽略用户配置和规则），将当前选区发送给 OpenAI。适配器使用 JSON schema 和最终消息文件，校验后仍返回 text/engine/confidence，保持原有人工整理和复核流程。临时图片和结果完成后清理，不写入业务数据目录；进程崩溃可能留下临时文件。详见 README 的配置与隐私边界。

SQLite 新增两张表（`practice.py` 自动初始化）：
- `practice_question`：id/title/有序 blocks JSON/choices JSON/parts JSON/独立 answer 和 explanation/created_at。
- `question_asset`：id/question_id/重编码 PNG BLOB/alt。只有用户逐张确认过的图表进入保存事务。该确认不是自动隐私检测。

题面 blocks 为 text、latex 或 image 引用。图片不得指定远程 URL、文件路径或 SVG；文字用 textContent，公式由本地 KaTeX（trust:false）渲染。列表及题面详情不包含答案字段，答案须显式请求独立接口。没有历史作答字段、自动判题或整卷导出。

既有数据和接口保留，不做破坏性迁移；首页不再提供旧写入路径。新旧表无外键关联，练习题重开不需要原图。旧写入 API 仍可被直接调用，不应把它误认为新隐私流程；关闭/迁移需单独决定。

## 以下为保留的旧版整卷目标设计（非当前默认流程）

# 整卷拍照 → 错题本：数据与处理设计

## Demo 与目标系统的边界

此 Demo 是单用户、仅本机运行的流程验证，不是生产教学平台。运行时使用 SQLite，方便无需数据库服务启动；`schema.sql` 是独立的 PostgreSQL 14+ 目标结构，**不是已接入的 PostgreSQL 后端**。将来迁移需要实现对应 repository、迁移脚本、权限和备份。UI 中的合成样卷与预置文本用于演示，不能当成真实 OCR 准确率测试。

## 数据主线

```
learner（匿名代号） ── exam_submission ── exam
                          │
                      page_image ── ocr_job ── ocr_result（原始、版本化）
                          │                         │
                      question_region ─────────────┘
                          │
                       question ── question_revision（人工编辑审计）
                          ├── question_knowledge ── knowledge_point
                          └── question_attempt ── review_record
```

原始上传以 `image_asset(kind=original)` 保存，归一化工作图另建 `image_asset(kind=normalized)` 并关联来源，二者各有校验和。原件不被旋转、裁剪和 OCR 覆写；应保护其可能包含的 EXIF 隐私。

`question_version` 保存印刷题面、公式、图形描述；`question_attempt` 保存学生手写作答及其转写；`grading_observation` 保存教师批改痕迹、分值及人工确认状态。三者不得混为一个 OCR 文本；`question_revision` 则是编辑审计，不替代题目语义版本。

一张照片不是一道题。一份提交可以有多页；一道题可以有多块区域，跨页图形、题干和学生答案分别定位。题干有纯文本及 LaTeX 两种表达，几何图保留图片区域，不强行转成文字。原图、原始 OCR、人工确认内容分开保存，以便追溯。

`exam_submission` 绑定匿名学习者与考试；复合外键确保题目区域来自同一份提交、OCR 来自同一张图，错题记录归属于该提交的学习者。学习者代号不能替代生产系统的认证授权。

## 推荐处理流程

1. **导入**：校验图片 MIME、解码后的尺寸和字节数；修正 EXIF 方向；生成随机存储键；计算 SHA-256。原文件名不用于路径。工作图移除 EXIF 等非必要信息；原始文件单独保护并保留校验和。
2. **预处理**：倾斜、透视、光照纠正属于后续能力，不能在 Demo 中默认为已完成。所有框坐标都必须在明确的、纠正方向后的原图坐标系中保存。
3. **OCR**：创建有状态任务，记录引擎版本、语言、参数。运行本地引擎；失败保留原因，不假造识别结果。成功结果追加保存，不覆盖旧版本。数学公式和手写识别需要专用模型，普通 OCR 只辅助校对。
4. **切题**：自动题号/版面识别可提出候选框，但需要人工调整。使用 `[0,1]` 归一化矩形，多图区域保持顺序。Demo 采用人工圈选，避免把自动切题准确率描述得过高。
5. **校对**：对照原图编辑题干、参考答案、解析与学生作答。空白不等于答错；不能仅依据 OCR 自动判错、推断错误原因或编造答案。用户明确确认后才进入错题本。
6. **保存**：一个事务中写入题目、区域与错题记录。编辑采用 `UPDATE ... WHERE id=:id AND revision=:expected`；零行更新代表版本冲突，不能静默覆盖。PostgreSQL 触发器自动维护 revision 与审计快照。
7. **复习**：每次复习追加 `review_record`，掌握状态与下次复习时间独立更新。Demo 不声称已实现间隔复习算法。

## PostgreSQL 初始化

```sh
createdb exam_notebook
psql postgres:///exam_notebook -v ON_ERROR_STOP=1 -f schema.sql
```

脚本在一个事务中建立独立 `notebook` schema，无扩展依赖、不包含 DROP。应在空数据库执行，重复执行会报错并回滚；它不是幂等迁移工具。生产迁移建议使用有版本记录的迁移框架。

为避免误删，关联外键默认拒绝删除存在依赖的记录。真正的清除操作需要按保留策略执行显式事务并清理文件、派生图与备份，不应只删一条题目记录。当前脚本没有数据库角色、RLS 或联网认证，不可直接暴露给多用户。

## 安全、隐私与可靠性

- 默认仅绑定回环地址；不要改成 `0.0.0.0` 后直接公开。当前 Demo 的显式识别操作会把当前选区发给 OpenAI；不会自动上传整卷，页面无远程 CDN。
- 试卷可能含未成年人姓名、学校、分数、笔迹。真实数据应先遮挡不需要的身份信息；限制本机账号和文件权限，避免同步到公共网盘或提交 Git。
- 只接受受限格式及体积的图片；不执行上传内容；构建 HTML 使用转义，禁止将 OCR 内容当 HTML 执行。生产中增加解码隔离、病毒扫描、CSRF/身份认证和请求速率限制。
- 本地 OCR 不等于完全无风险。图片解析器需要更新，任务需要超时、内存上限、失败重试和进程隔离。队列可使用 `FOR UPDATE SKIP LOCKED` 领取任务，重试应新建结果版本。
- PostgreSQL 的 JSONB 用于原始 OCR 与可变结构，关系、权限、检索字段用普通列。不能把整卷所有内容塞进一个 JSON 当作唯一模型。
- OCR 置信度仅描述引擎对文字的判断，不代表数学答案正确率。公式、上下标、分式、根号与几何图都应人工检查。
- 当前 Codex 云识别已在按钮旁说明接收方和发送内容；失败不切换到其他服务。

## 可逐步扩展

第一步接入 PostgreSQL 并迁移 SQLite 数据；第二步加入版面切题与公式 OCR；第三步加入全文搜索、知识点筛选、错题导出；第四步再实现多用户权限与复习计划。每一步均应保留人工确认入口和原图追溯能力。
