# 当前实现结构

## 主要模块

| 文件 | 职责 |
|---|---|
| `app.py` | 本机访问限制、错误处理、数据目录与应用启动 |
| `bank.py` | 识别、题目保存和查询、资产读取、组卷快照 |
| `content.py` / `blocks.schema.json` | 新版 Block 数据格式与语义校验 |
| `geometry.py` / `geometry.schema.json` | 几何坐标和引用校验 |
| `assets.py` | 图片传输解码、PNG 规范化、SVG 白名单校验 |
| `codex_ocr.py` | 隔离 CLI 调用、超时与临时文件清理 |
| `static/blocks.js` | 所有页面共用的递归内容渲染、公式、图表 SVG |
| `static/geometry.js` | 几何 SVG 渲染 |
| `static/bank.js` | 递归编辑器、上传、预览校验、题库与组卷交互 |
| `scripts/generate_examples.py` | 生成 16 道示例 JSON 与浏览器数据 |

## 内容链路

识别结果或手工草稿 → 编辑器 → 更新预览并调用 `/api/bank/validate` → 人工校对 → 题目与递归资产同事务保存 → 题库读取 → 练习卷快照 → 共用渲染器显示及打印。

文字、填空与图标连续排列，图片、图表和组容器独立显示。简单选项、小问、单元格可转换成组合内容；只有一个文字子块时可简化回来。几何和图表结构使用 JSON 编辑，显示宽度提供滑块。

滑块即时更新预览，但修改后需要重新通过预览校验并勾选确认。异步校验不能批准提交后又被编辑的旧快照。保存中禁用编辑、导入和重复提交。

## API

| 方法与路径 | 作用 |
|---|---|
| `GET /api/status` | 本机 CLI 可用性 |
| `POST /api/bank/extract` | 接收原图二进制，返回新版题目草稿及临时资产 |
| `POST /api/bank/validate` | 校验题目结构，返回补齐类型默认值后的内容 |
| `POST /api/bank/assets/validate` | 校验上传图片，返回规范化 MIME 和 Base64 |
| `POST /api/bank/questions` | 接收 `question/assets/source/reviewed`，保存新题 |
| `GET /api/bank/questions` | 读取题库 |
| `GET /api/bank/assets/<id>` | 读取资产 |
| `POST /api/bank/worksheets` | 按选题顺序创建快照 |
| `GET /api/bank/worksheets` | 读取练习卷列表 |
| `GET /api/bank/worksheets/<id>` | 读取快照 |

## 识别传输与正式格式

CLI 的结构化输出使用必填可空字段来表达不同节点；不适用字段返回 null。服务端去掉传输中的 null 后，使用正式 Block Schema 校验。这个识别传输结构不是旧数据兼容层。

图形识别使用 `image.assetId`，裁剪坐标独立放在输出的 `crops` 中。服务端递归查找所有层级的图片并附上裁剪后的临时资产。坐标不进入最终图片 Block。识别不根据图片臆造几何坐标或统计数据。

## 范围与限制

13 种类型使用新版字段，不维护旧 `choices/parts/latex` 逻辑。默认采用独立的 `data/blocks-v2`，原数据库不迁移或删除。设计文档中的后续统一规则不作为本轮实现要求。

没有答案判分、已入库题目编辑删除、表格合并或嵌套表格、图表堆叠/缺失值/双纵轴。几何标签为纯文字。测试使用假 CLI，不代表真实识别准确率或当前账号网络、额度已验证。
