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

可选 Codex CLI 识别（需要联网和 OpenAI API 额度）：

1. 安装官方 [Codex CLI](https://developers.openai.com/codex/cli/)，确保 `codex` 在 PATH 中。可用 `EXAM_CODEX_BIN` 指定可信可执行文件的绝对路径，不能填写整段 shell 命令；Windows 使用原生可执行文件，不支持 `.cmd`/`.bat` 包装器。
2. 在启动应用的进程环境中安全设置 `EXAM_CODEX_API_KEY`（也接受 `CODEX_API_KEY`）。不要把密钥写进源码、命令行参数、日志或提交到 Git。本实现刻意不读取个人 `~/.codex` 登录、配置、规则、hooks 或插件，已有 `codex login` 不会自动复用。
3. 启动应用。状态只检查程序和密钥是否已配置，不代表网络、额度或认证已验证；点击识别失败时会显示可操作的错误，仍可手工录入。

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

每次请求使用独立临时工作目录、HOME 和 CODEX_HOME、环境变量白名单、固定 argv（不用 shell）、只读沙箱、`approval_policy=never`，关闭 shell、额外读图、联网搜索、hooks、apps、插件及子代理功能。只把图片作为不可信转写素材，禁止执行图中文字的指令。严格校验最终 JSON 的唯一 text 字段（不超过 20,000 字符），不信任 stdout，不记录 CLI 输出或密钥。90 秒超时；POSIX 超时终止整个进程组；最多同时 2 个识别请求。

这不是操作系统容器隔离；依赖可信的官方 CLI 和宿主机。管理员强制配置不被绕过，冲突应修正部署环境。Windows 的进程终止和安全沙箱尚未实机验证，建议先在受控 Linux/macOS 环境验证；不要在配置了强制第三方 MCP/自定义 provider 的宿主机上使用。本地临时文件短暂存在，敏感身份信息须在点击识别前裁掉。
