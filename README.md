# 拾题 · 整张试卷录入错题集（本地 Demo）

把“整张试卷照片 → 框选题目 → 本地 OCR → 人工校对 → 错题收录”跑通的最小工作台。依据讨论中的三层分离原则：**印刷题面、学生作答、教师批改不能混在一起**。

## 30 秒理解

- 中文界面，响应式布局。上传 PNG/JPG/WebP，或点击“试试合成演示卷”。
- 拖动框选图片区域；可选择本地 Tesseract 真实 OCR，也可直接人工录入。
- “填入演示文字”**不是 OCR**，只对内置合成试卷可用。真实上传图片不会悄悄回退成假文字。
- 校对题干/公式源文、作答、答案、解析、知识点、错因、教师批改，勾选确认后保存。
- 错题集可以追溯试卷选区、导出 JSON。重启后仍保存在本机。
- 不访问云 OCR、CDN 或任何第三方。仅监听 `127.0.0.1`。

## 启动（Python 3.12+）

macOS / Linux：
```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

Windows PowerShell：
```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

浏览器打开 **http://127.0.0.1:8765**。启动依赖安装需要联网；应用运行时不联网。按 Ctrl+C 停止。不要将开发服务器公开到互联网或共享局域网。

### 可选：安装本地 OCR

未安装 Tesseract 时，合成演示与手工录入仍能使用。真实 OCR 要求 `tesseract` 可从 PATH 调用。中文需要 `chi_sim` 语言包：

```sh
# Debian / Ubuntu
sudo apt install tesseract-ocr tesseract-ocr-chi-sim
# macOS（已安装 Homebrew）
brew install tesseract tesseract-lang
# 检查语言列表
tesseract --list-langs
```

Windows 按 Tesseract 官方安装说明选择安装包，安装简体中文语言数据并将可执行文件目录加到 PATH，重新启动程序。
官方说明：https://tesseract-ocr.github.io/tessdoc/Installation.html

普通 Tesseract **不等于数学公式 / 手写 / 自动阅卷模型**。分式、根号、上下标、图形都需要人工复核。没有置信度数值时不会编造分数。

## 推荐试用流程

1. 点击“试试合成演示卷”。它不含任何真实学生信息。
2. 在图片顶部第一道题上拖动一个框，点击“填入演示文字”。此按钮填入整页预置文字，**不会按选区自动切题**。删除无关题目，人工留下要收录的一题。
3. 分别填写学生实际作答、正确答案、解析、教师批改；未知内容留空，不推测错因。
4. 勾选“我已核对”，保存。下方立即出现错题卡片。
5. 点击卡片“查看来源与选区”，或“导出错题 JSON”。
6. 要验证真实 OCR，框选试卷底部英文测试区，选“英文 / 数字”，点击“本地 OCR”。

## 数据、隐私与备份

默认 `data/` 存放：
- `notebook.sqlite3`：试卷及人工确认错题。demo 采用紧凑 JSON 字段，并非完整生产数据库结构。
- `originals/`：上传原始字节、SHA-256/尺寸元数据。**原件可能保留 EXIF/身份信息，不通过网页直接公开。**
- `images/`：按 EXIF 校正方向、移除元数据的工作图。
- `ocr/`：每次成功真实识别的原始文本、语言、选区（追加保存）。

停止应用后备份整个 `data/`；只导出 JSON 不包含图片。环境变量 `EXAM_DATA_DIR` 可选择数据目录。不要将 `data/` 提交 Git 或放进公共同步目录。没有账号隔离或加密，本机其他有权限的用户可能读取数据。真实试卷含未成年人隐私，应先遮挡不必要姓名、学校等身份信息。

## 数据库设计

`schema.sql` 是独立 PostgreSQL 14+ 目标结构，包括原始图片/工作图、试卷提交与页面、OCR 任务与版本结果、题面版本、题目区域、学生作答、教师批改、知识点和复习记录。详见 `ARCHITECTURE.md`。

**本 demo 实际使用 SQLite，未接通 PostgreSQL。** SQL 已通过 PostgreSQL 语法解析，但未在 PostgreSQL 实例上执行；生产化还需迁移与数据库集成测试、认证、权限、备份和任务队列。

## 验证与当前边界

```sh
python -m pip install -r requirements-dev.txt
python -m pytest -q
node --check static/app.js   # 可选 JS 语法检查
```

已在 Linux / Python 3.12 验证：完整 API 收录流程、重启持久化、真实 Tesseract 英文测试、非法输入、跨域及 Host 拒绝、原图保留和校验和。没有在 macOS/Windows 实机运行；云浏览器与执行容器隔离，无法连接 localhost，**未完成真实浏览器端到端验收**。

当前不包含：自动版面切题、多页/跨页题目绑定、透视纠正、专用公式与手写识别、自动判错、多学生账号、复习计划、修改已保存记录或删除数据。校对编辑发生在保存前；重复保存会新增记录。OCR 是同步、限时子进程，尚无生产任务队列。公式保留为纯文本/LaTeX 源文，不加载远程渲染器。

## 文件导航

- `app.py`：本地 HTTP API、图片/OCR、SQLite
- `static/`：原生 HTML/CSS/JS 中文 UI
- `samples/exam.png`：已生成的合成样卷
- `samples/generate.py`：可选重新生成样卷（提供中文字体路径）
- `schema.sql` / `ARCHITECTURE.md`：PostgreSQL 结构与流程设计
- `tests/test_app.py`：自动化测试
- `requirements-lock.txt`：本次测试环境完整依赖记录
