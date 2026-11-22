# 拾题 · 试卷拆题、题库与组卷

当前首页已按多题工作流重构：一张整卷或局部试卷图片，经 Codex CLI 结构化识别为多道独立题目，逐题校对归类入库，再选题排版成练习卷。

## 快速运行

```sh
source .venv/bin/activate
python app.py
```

打开 http://127.0.0.1:8765 。首次安装依赖参见下方旧版启动说明。Codex CLI 登录和安全配置沿用现有适配器；没有 CLI 也能用首页「体验三题演示」或手工录入验证整个入库和组卷流程。

## 本机无沙箱运行

显式使用本机 Codex CLI、已有登录，并关闭识别子进程的沙箱：

```sh
EXAM_CODEX_BIN=/opt/homebrew/bin/codex EXAM_CODEX_SANDBOX=danger-full-access .venv/bin/python app.py
```

`EXAM_CODEX_SANDBOX` 未设置时仍为 `read-only`；`danger-full-access` 表示该 CLI 子进程不受沙箱隔离。继续禁用模型工具调用。CLI 在本机运行，图像识别仍通过 OpenAI 云服务完成。

## 新版流程

1. 选择整页或部分试卷（PNG/JPEG/WebP，4 MB、800 万像素以内）。点击识别会把**所选整张图片**发送给 OpenAI；先自行去除姓名、学号等信息。照片不写入业务数据库。页面会显示当前待识别文件名。替换图片失败或取消确认时，清除待识别图片并保留已有草稿；需重新选择图片才能识别。进入离线演示也会清除待识别图片，不调用 Codex。
2. Codex 通过 JSON Schema 返回题目数组。按主问题拆分，小问留在同一题；分类含选择题、填空题、计算题、解答题和其他。学科、知识点、原卷题号可校对。
3. 文字、LaTeX 公式、图表组成有序内容块。选项与小问支持 `\(公式\)` 内联数学；图表从原图裁剪，坐标采用全图 0～1000 的左、上、右、下。可修改坐标重新裁剪，预览后逐题确认入库。不完整或模糊内容会提示人工补全；不要把模型分类或裁剪当作已验证结果。
4. 每道题获得永久编号，如 `Q000001`，与原卷题号独立。题库可按题型、学科、编号、题干、来源和知识点检索。图表作为 PNG BLOB 与题目同事务保存。
5. 选多道题，调整顺序、作答留白和卷名，保存练习卷。卷内按 1、2、3… 编号；可重新打开、浏览器打印或另存 PDF。打印使用 A4 样式，长题的跨页效果需在浏览器打印预览中检查。

## 数据与范围

- SQLite 新增 `bank_question`、`bank_asset`、`worksheet`，练习卷保存所选题目的内容快照和行数。原有表及数据不改动，不自动迁移。
- `/single` 保留旧版单题工作台；其“不发送整页”等说明**仅适用于旧版页面**。旧 API 仍可用。
- 识别草稿在浏览器内存中，刷新即丢失；已保存题目和试卷可跨重启恢复。原图仅在 CLI 临时目录中处理，正常结束清理；程序崩溃时不保证即时清理。
- 这是一版可运行的核心闭环：暂不含已入库题目的编辑删除、自动合并拆错的题目、批量多页导入、难度评估或 DOCX 导出。拆错的草稿可手动修改内容、添加或移除题目。答案解析不从试卷自动提取。
- 自动化检查覆盖结构校验、图表裁剪、编号、事务失败、组卷顺序和重启持久化；真实模型的识别准确率仍需用实际试卷验收。

结构化调用依据：[OpenAI 官方非交互模式文档](https://learn.chatgpt.com/docs/non-interactive-mode)。新 API 与数据模型参见 [ARCHITECTURE.md](ARCHITECTURE.md)。

---

以下保留旧版单题工作台说明和 CLI 部署细节，仅适用于 `/single` 及旧接口。

# 拾题 · 单题练习工作台

把照片中的一道错题整理成可独立重做的练习题。无需保留整页原图，不还原整卷，不自动判题。

## 启动

Python 3.12+：

```sh
python -m venv .venv
# macOS / Linux
source .venv/bin/activate
# Windows PowerShell 改用 .\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

打开 http://127.0.0.1:8765 。只监听本机，不要将开发服务器暴露到互联网或局域网。没有账号隔离或数据加密。

可选 Codex CLI 识别（需要联网及可用的 ChatGPT 登录或 OpenAI API 额度）：

1. 安装官方 [Codex CLI](https://developers.openai.com/codex/cli/)，确保 `codex` 在 PATH 中。可用 `EXAM_CODEX_BIN` 指定可信可执行文件的绝对路径，不能填写整段 shell 命令；Windows 使用原生可执行文件，不支持 `.cmd`/`.bat` 包装器。
2. 在启动应用的同一用户环境中运行 `codex login`，复用已有 ChatGPT 登录。也可在启动应用的进程环境中安全设置 `EXAM_CODEX_API_KEY`（也接受 `CODEX_API_KEY`）。不要把密钥写进源码、命令行参数、日志或提交到 Git。识别进程沿用当前 HOME / CODEX_HOME 的登录；仍忽略用户配置和规则并禁用 hooks、插件。
3. 启动应用。状态检查程序以及密钥配置或 `codex login status`，不代表网络、额度或认证已验证；点击识别失败时会显示可操作的错误，仍可手工录入。

适配本机核对的 `codex-cli 0.167.0-alpha.4` 参数：`codex exec --image --output-schema --output-last-message --ephemeral --ignore-user-config --ignore-rules`。安装版本必须支持这些选项与所用安全配置；不支持时失败关闭，不降级到危险模式。参考 [非交互执行](https://developers.openai.com/codex/noninteractive) 与 [配置参考](https://developers.openai.com/codex/config-reference)。

## 使用流程

1. 选择 PNG/JPEG/WebP 照片，或加载合成演示卷。整页只在当前浏览器页面内存中预览，不发送后端。
2. 框选一道题，先裁掉姓名、学号、学校等身份信息，再点击「用 Codex 识别选区」。当前选区会经本机后端和 Codex CLI 发送给 **OpenAI**，可能产生 API 费用；不会自动发送整页或其他选区。未配置 CLI 也可手工录入。
3. 编辑按顺序排列的文字、LaTeX 公式，调整选项、小问。正确答案和解析独立填写；不要把旧作答和老师批注混入题面。
4. 解题必须的几何图等，可再次框选局部，人工确认不含旧答案、批注或个人信息后加入。确认不是自动脱敏，脏图须放弃或先手工处理。
5. 预览空白练习题，确认题面完整后保存。重新打开页面/重启程序后仍能重做；答案只在主动点击后加载展示。

公式由本地 KaTeX 转为 MathML，需支持原生 MathML 的现代浏览器，无 CDN 或远程资源；无法渲染的公式显示原始 LaTeX，需要校对。Codex 的文字、公式、手写转写都可能有误；识别结果先作为文字块添加，可手工整理为 LaTeX 块，不自动解题、批改或保存。

## 存储与隐私边界

- 新路径只向 SQLite 增加 `practice_question` 和 `question_asset`；题目不依赖 `paper_id` 或照片。
- 保存题干/公式/选项/小问/答案/解析，以及逐张确认的局部图表。图表重编码 PNG，清除 EXIF/附加元数据，以 BLOB 和题目同事务保存，失败不留孤立文件。
- 新 OCR 接口只接受原始二进制选区，拒绝 multipart，避免 Flask 上传文件临时落盘。CLI 需要图片文件：后端在系统私有临时目录写入清除元数据的单张 PNG、输出 schema 和结果文件，成功、超时或失败后清理，不写入业务数据目录。进程崩溃/断电可能留下临时目录；不承诺操作系统交换区、浏览器或磁盘取证级安全擦除。OpenAI 的服务端数据处理受所用账户/服务条款约束，本地清理不等于云端删除。
- 清除当前照片释放页面中的原图引用，不代表自动删除已编辑的题面/图表草稿。不要在草稿里保留身份信息。
- 旧版 `papers/questions` 数据、`originals/`、`images/` 和 `ocr/` 保持不变。首页仅提供旧记录查看；旧版 API 仍保留兼容性，直接调用旧 `/api/upload`、`/api/sample` 仍会保存旧格式数据。旧 `/api/ocr` 的真实识别改用相同 Codex 适配器，必须明确传 region，且不再新增原始 OCR 日志；预置合成演示文字不联网。需要关闭旧 API 或迁移/清理历史数据，应另行决定。
- 停止应用后备份整个 `data/`（可用 `EXAM_DATA_DIR` 更改）。不要提交 Git、公开分享或把真实未成年人资料放进公开仓库。

`schema.sql` 保留为原整卷 PostgreSQL 设计参考，**不是新单题功能实际使用的 schema 或迁移脚本**。应用自动非破坏性地新增 SQLite 表，不迁移、覆盖或删除旧数据。

## 检查

```sh
python -m pip install -r requirements-lock.txt
python -m pytest -q -rs
node --check static/practice.js
node --check static/practice_core.js
node --test tests/*.cjs
```

GitHub Actions 在 Ubuntu 上运行 Python 3.12 / Node 24 检查，含假 CLI 子进程、合成图片、失败/超时/清理、后端隐私/重启回归及前端模拟竞态测试。测试不使用密钥、不连接 OpenAI、不上传真实试卷，因而不验证模型准确率或真实账户可用性。不等同于 macOS/Windows 实机或真实浏览器端到端验收。

## CLI 执行边界

每次请求使用独立临时工作目录，复用当前 HOME 和 CODEX_HOME 的登录，使用环境变量白名单、固定 argv（不用 shell）、只读沙箱、`approval_policy=never`，关闭 shell、额外读图、联网搜索、hooks、apps、插件及子代理功能。只把图片作为不可信转写素材，禁止执行图中文字的指令。严格校验最终 JSON 的唯一 text 字段（不超过 20,000 字符），不信任 stdout，不记录 CLI 输出或密钥。90 秒超时；POSIX 超时终止整个进程组；最多同时 2 个识别请求。

这不是操作系统容器隔离；依赖可信的官方 CLI 和宿主机。管理员强制配置不被绕过，冲突应修正部署环境。Windows 的进程终止和安全沙箱尚未实机验证，建议先在受控 Linux/macOS 环境验证；不要在配置了强制第三方 MCP/自定义 provider 的宿主机上使用。本地临时文件短暂存在，敏感身份信息须在点击识别前裁掉。
