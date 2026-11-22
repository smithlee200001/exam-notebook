# 拾题 · 试卷拆题、题库与组卷

当前首页已按多题工作流重构：一张整卷或局部试卷图片，经 Codex CLI 结构化识别为多道独立题目，逐题校对归类入库，再选题排版成练习卷。

## 快速运行

```sh
source .venv/bin/activate
python app.py
```

打开 http://127.0.0.1:8765 。首次安装请使用 Python 3.12+ 创建虚拟环境，并执行 `python -m pip install -r requirements.txt`。没有 CLI 也能用首页「体验 16 题示例」或手工录入验证整个入库和组卷流程。

## 本机无沙箱运行

显式使用本机 Codex CLI、已有登录，并关闭识别子进程的沙箱：

```sh
EXAM_CODEX_BIN=/opt/homebrew/bin/codex EXAM_CODEX_SANDBOX=danger-full-access .venv/bin/python app.py
```

`EXAM_CODEX_SANDBOX` 未设置时仍为 `read-only`；`danger-full-access` 表示该 CLI 子进程不受沙箱隔离。继续禁用模型工具调用。CLI 在本机运行，图像识别仍通过 OpenAI 云服务完成。

## 题型显示示例

首页点击「体验 16 题示例」，可验证单空、多空、单选、多选、小问、表格、PNG/SVG 图片、柱状图、折线图、几何图和提示图标。每道题均可编辑、保存和组卷，不调用 Codex。题面及核对答案见 [示例说明](EXAMPLES.md)，数据格式见 [Block 设计](BLOCK_DESIGN.md)。

## 新版流程

1. 选择整页或部分试卷（PNG/JPEG/WebP，4 MB、800 万像素以内）。点击识别会把**所选整张图片**发送给 OpenAI；先自行去除姓名、学号等信息。照片不写入业务数据库。页面会显示当前待识别文件名。替换图片失败或取消确认时，清除待识别图片并保留已有草稿；需重新选择图片才能识别。进入离线演示也会清除待识别图片，不调用 Codex。
2. Codex 通过 JSON Schema 返回题目数组。按主问题拆分，小问留在同一题；分类含选择题、填空题、计算题、解答题和其他。学科、知识点、原卷题号可校对。
3. 文字与 LaTeX 共用 text，填空为 blank，选项和小问使用嵌套 Block；图表从原图裁剪，坐标采用全图 0～1000 的左、上、右、下。可修改坐标重新裁剪，预览后逐题确认入库。不完整或模糊内容会提示人工补全；不要把模型分类或裁剪当作已验证结果。
4. 每道题获得永久编号，如 `Q000001`，与原卷题号独立。题库可按题型、学科、编号、题干、来源和知识点检索。图片作为 PNG 或经校验的 SVG BLOB，与题目同事务保存。
5. 选多道题，调整顺序、作答留白和卷名，保存练习卷。卷内按 1、2、3… 编号；可重新打开、浏览器打印或另存 PDF。打印使用 A4 样式，长题的跨页效果需在浏览器打印预览中检查。

## 数据与范围

表结构、字段解释、JSON 示例、事务与查询方法见 [数据库设计说明](DATABASE.md)。

- SQLite 只使用 `bank_question`、`bank_asset`、`worksheet` 三张业务表；练习卷保存所选题目的内容快照和行数。
- 识别草稿在浏览器内存中，刷新即丢失；已保存题目和试卷可跨重启恢复。原图仅在 CLI 临时目录中处理，正常结束清理；程序崩溃时不保证即时清理。
- 这是一版可运行的核心闭环：暂不含已入库题目的编辑删除、自动合并拆错的题目、批量多页导入、难度评估或 DOCX 导出。拆错的草稿可手动修改内容、添加或移除题目。答案解析不从试卷自动提取。
- 自动化检查覆盖结构校验、图表裁剪、编号、事务失败、组卷顺序和重启持久化；真实模型的识别准确率仍需用实际试卷验收。

结构化调用依据：[OpenAI 官方非交互模式文档](https://learn.chatgpt.com/docs/non-interactive-mode)。新 API 与数据模型参见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## Codex CLI 配置

安装官方 Codex CLI 后运行 `codex login`。可通过 `EXAM_CODEX_BIN` 指定可信可执行文件的绝对路径，通过 `EXAM_CODEX_API_KEY` 或 `CODEX_API_KEY` 配置密钥。状态检查不代表网络、额度或云服务可用性已验证。

识别使用 `codex exec --image --output-schema --output-last-message --ephemeral --ignore-user-config --ignore-rules`；安装的 CLI 必须支持这些参数。默认只读沙箱，可按上文显式设置无沙箱模式。子进程复用当前 HOME / CODEX_HOME 登录，使用环境变量白名单，禁止模型工具调用、搜索、hooks、插件及子代理，不使用 shell 执行命令。

每次识别使用独立私有临时目录保存清理元数据后的图片、schema 和结果。正常成功、失败或超时后清理；进程崩溃或断电可能留下临时文件。90 秒超时，最多两个并发识别请求；POSIX 下超时会终止子进程组。图片识别会通过 OpenAI 云服务完成，本机临时文件清理不等于云端删除。

## 本地数据

默认存储在 `data/blocks-v2/notebook.sqlite3`，可用 `EXAM_DATA_DIR` 指定数据目录。旧的 `data/notebook.sqlite3` 不变，新版不读取旧格式。指定自定义目录时请使用空目录或已有新版数据库。停止程序后备份数据目录。应用仅监听 `127.0.0.1`，当前没有多用户认证和数据加密。

项目只维护当前题库与组卷流程，不提供旧版数据迁移或兼容接口。启动不会执行旧表清理或删除已有磁盘文件；需要全新数据库时可指定新的 `EXAM_DATA_DIR`。

## 检查

```sh
python -m pip install -r requirements-lock.txt
python -m pytest -q -rs
node --check static/bank.js
node --check static/geometry.js
node --check static/blocks.js
node --test tests/*.cjs
```

自动化测试使用合成图片和假 CLI，不访问 OpenAI，不验证真实模型准确率。覆盖图片校验与元数据清理、结构化识别、失败和超时清理、题目入库、组卷快照、重启持久化及前端照片切换竞态。
