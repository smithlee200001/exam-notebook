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

可选本地 OCR：

```sh
# Debian / Ubuntu
sudo apt install tesseract-ocr tesseract-ocr-chi-sim
# macOS / Homebrew
brew install tesseract tesseract-lang
# 确认 eng；中文还需要 chi_sim
tesseract --list-langs
```

Windows 参阅 [Tesseract 安装说明](https://tesseract-ocr.github.io/tessdoc/Installation.html)，安装语言包并加入 PATH。

## 使用流程

1. 选择 PNG/JPEG/WebP 照片，或加载合成演示卷。整页只在当前浏览器页面内存中预览，不发送后端。
2. 框选一道题，点击本地 OCR。只发送选区的 PNG 像素，后端通过 stdin/stdout 调用 Tesseract，不保存识别图片或原始识别文本。没有 Tesseract 也可手工录入。
3. 编辑按顺序排列的文字、LaTeX 公式，调整选项、小问。正确答案和解析独立填写；不要把旧作答和老师批注混入题面。
4. 解题必须的几何图等，可再次框选局部，人工确认不含旧答案、批注或个人信息后加入。确认不是自动脱敏，脏图须放弃或先手工处理。
5. 预览空白练习题，确认题面完整后保存。重新打开页面/重启程序后仍能重做；答案只在主动点击后加载展示。

公式由本地 KaTeX 转为 MathML，需支持原生 MathML 的现代浏览器，无 CDN 或远程资源；无法渲染的公式显示原始 LaTeX，需要校对。Tesseract 对公式和手写识别有限，不等于自动公式识别或批改工具。

## 存储与隐私边界

- 新路径只向 SQLite 增加 `practice_question` 和 `question_asset`；题目不依赖 `paper_id` 或照片。
- 保存题干/公式/选项/小问/答案/解析，以及逐张确认的局部图表。图表重编码 PNG，清除 EXIF/附加元数据，以 BLOB 和题目同事务保存，失败不留孤立文件。
- 新 OCR 接口只接受原始二进制选区，拒绝 multipart，避免 Flask 上传文件临时落盘。应用不持久化这些输入或 OCR 原文；这不承诺操作系统交换区、浏览器或磁盘取证级安全擦除。
- 清除当前照片释放页面中的原图引用，不代表自动删除已编辑的题面/图表草稿。不要在草稿里保留身份信息。
- 旧版 `papers/questions` 数据、`originals/`、`images/` 和 `ocr/` 保持不变。首页仅提供旧记录查看；旧版 API 仍保留兼容性，直接调用旧 `/api/upload`、`/api/sample`、`/api/ocr` 仍会保存旧格式数据。需要关闭旧 API 或迁移/清理历史数据，应另行决定。
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

GitHub Actions 在 Ubuntu 上运行 Python 3.12 / Node 24 检查，含真实英文 OCR、后端隐私/重启回归及前端模拟竞态测试。不等同于 macOS/Windows 实机或真实浏览器端到端验收。
