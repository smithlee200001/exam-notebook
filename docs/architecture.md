# 代码结构与职责

本次目录重构保持 HTTP API、题目与答案 JSON、SQLite 表结构和用户操作流程不变。启动仍执行 `python app.py`，默认数据仍为 `data/blocks-v2/notebook.sqlite3`。

## 目录总览

```text
app.py                         # 本地启动入口
notebook/
  __init__.py                  # create_app、访问限制、错误处理、注册 API
  config.py                    # 仓库根路径、数据目录配置
  api/                         # HTTP 请求/响应、状态码
  services/                    # 题目、答案、组卷、识别业务与事务
  domain/                      # Block、几何、答案的纯数据校验
  storage/
    database.py                # 连接管理和建表
    repository.py              # 参数化 SQL 读写
    schema.sql                 # 当前 SQLite 表与索引
  integrations/codex_cli.py     # CLI 调用、超时与临时文件清理
  media/                       # PNG 规范化与 SVG 白名单
  schemas/                     # Schema 文件及本地引用注册表
static/
  index.html                   # 唯一页面入口
  js/
    main.js                    # 页面初始化与事件接线
    api.js, dom.js, events.js   # 请求、DOM 辅助、页面通知
    model/                     # 草稿状态、Block 模板、答案目标、示例加载
    render/                    # 题面、公式、几何、图表、答案渲染
    editors/                   # 题面树、答案表单、题库答案面板
    pages/                     # 图片导入、题库、组卷、页面切换
  css/                         # base、layout、editor、content、print
  examples/questions.json      # 唯一生成的示例数据
  vendor/katex/                # 已打包的第三方公式引擎
examples/                      # 题目及答案的可维护源数据
scripts/                       # 生成示例、补充已有示例答案的命令入口
tests/
  backend/                     # API、事务、校验、媒体与 CLI
  frontend/                    # 实际 ES Modules 的交互与渲染测试
  fixtures/                    # 前后端共享的答案目标核对样本
docs/                          # 数据库、Block、答案、几何与示例说明
```

## 后端边界

请求经过 `api → services → domain / storage / media / integrations`。API 只负责读取请求、响应和状态码；服务组织业务步骤。`domain` 不依赖 Flask、数据库或 CLI。存储层接收连接执行参数化 SQL，不自行提交事务；服务层决定事务范围，连接上下文负责提交、回滚和关闭。

题目及关联图片、可选答案同事务入库。答案修改先锁定并读取题面，校验目标和资产归属，再更新。组卷同一事务读取题目与答案，存为独立快照；编辑实时答案不会改变已保存的试卷。

`schemas/blocks.schema.json` 保存通用 Block 定义；题目与答案 Schema 引用它，几何定义引用独立的 geometry Schema。`registry.py` 仅解析本地已注册文件，不从网络加载 Schema。识别传输的 `extraction.schema.json` 单独维护，因为 CLI 要求的必填可空字段与正式存储格式不同。它不是旧数据兼容层。

## 前端边界

浏览器直接加载原生 ES Modules，无打包步骤。`main.js` 初始化页面、绑定页面通知；`state.js` 明确保存草稿、选题和当前试卷，避免依赖脚本加载顺序下的隐式全局变量。页面通过通知协调选题变化，渲染器不读取页面状态，也不发送请求。

所有题面预览、题库卡片和打印共用 `render/`。`text` 的普通文字始终成为文本节点，公式交给 KaTeX。图表与几何使用 SVG 元素和白名单属性。答案目标识别、答案渲染、答案编辑分离，`answers.js` 仅重新导出公共接口。

编辑器保留原行为：更改后重新预览校验、人工勾选确认后入库；异步校验不能批准已变更的草稿。显示宽度仍默认 60%，写入数据库和组卷快照。CSS 分为基础、布局、编辑器、内容、打印五个文件，按此顺序加载。

示例点击时才读取 `static/examples/questions.json`；手工插入几何或图表使用独立的生产模板，不依赖示例集合。示例源位于 `examples/questions.py` 与 `examples/answers.py`，运行 `python -m scripts.generate_examples` 重新生成。

## 常见修改入口

| 要修改的内容 | 主要位置 |
|---|---|
| Block 字段及约束 | `notebook/schemas/`、`notebook/domain/blocks.py` |
| 答案目标及校验 | `notebook/domain/answers.py`、`static/js/model/answer-targets.js` |
| 数据库表和索引 | `notebook/storage/schema.sql` |
| 题目/答案保存与事务 | `notebook/services/questions.py`、`answers.py` |
| 组卷及答案快照 | `notebook/services/worksheets.py` |
| 公式字号、分数规则 | `static/js/render/math.js`、`static/css/content.css` |
| 几何与统计图 | `static/js/render/geometry.js`、`chart.js` |
| 题面与答案录入界面 | `static/js/editors/` |
| 试卷预览和打印 | `static/js/pages/worksheet.js`、`static/css/print.css` |
| 识别结果转换与裁剪 | `notebook/services/extraction.py` |
| 模型进程参数和超时 | `notebook/integrations/codex_cli.py` |

## API 保持不变

| 方法与路径 | 用途 |
|---|---|
| `GET /api/status` | CLI 配置状态 |
| `POST /api/bank/extract` | 图片识别与裁剪 |
| `POST /api/bank/validate` | 题面及可选答案预览校验 |
| `POST /api/bank/assets/validate` | 图片规范化及 SVG 校验 |
| `POST /api/bank/questions` | 题目、资产及可选答案入库 |
| `GET /api/bank/questions` | 题库列表 |
| `GET /api/bank/assets/<id>` | 资产内容 |
| `POST /api/bank/answers/validate` | 答案预览校验 |
| `GET/PUT/DELETE /api/bank/questions/<id>/answer` | 查询、更新、清空答案 |
| `POST /api/bank/worksheets` | 创建试卷快照 |
| `GET /api/bank/worksheets` | 试卷列表 |
| `GET /api/bank/worksheets/<id>` | 试卷快照 |

## 验证与范围

```sh
python -m pytest -q
node --experimental-vm-modules --test tests/frontend/test_*.cjs
```

测试使用临时数据库、合成图片和假 CLI，不会发送真实图片到模型。共享 fixture 核对前后端的答案目标与标签一致，示例测试核对源数据与生成 JSON 一致。浏览器模块加载、嵌套内容渲染、分数大小、答案编辑、校验竞态和试卷模式均有覆盖。

本次不添加数据库迁移、旧格式兼容、自动判分或额外统一规则。设计文档里的容量、深度等后续规划保持规划状态。
