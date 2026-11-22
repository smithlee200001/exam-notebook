# 当前数据库与内容格式

本版实现 [Block 类型设计](BLOCK_DESIGN.md) 中已讨论的内容类型。旧的 `choices`、`parts`、独立 `latex` 和图片内嵌数据字段已从业务模型移除，不提供旧数据兼容或迁移。

## 存储位置和初始化

默认数据库为 `data/blocks-v2/notebook.sqlite3`。此前 `data/notebook.sqlite3` 保留原样，新版不读取或修改它。不要将 `EXAM_DATA_DIR` 指向旧版数据库目录。

路径优先级：`create_app(data_dir)` > `EXAM_DATA_DIR` > 默认新目录。[app.py](app.py) 确定目录，[bank.py](bank.py) 的 `make_bank()` 执行建表 SQL。没有独立 `.sql` 文件，不维护 PostgreSQL 版本。

## 三张业务表

```sql
CREATE TABLE bank_question (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    kind TEXT NOT NULL,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE bank_asset (
    id TEXT PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES bank_question(id),
    content BLOB NOT NULL,
    mime_type TEXT NOT NULL
);
CREATE TABLE worksheet (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    items TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX bank_classification ON bank_question(subject, kind);
```

`bank_question.id` 生成显示编号 `Q000001`，与原卷题号和卷内排号无关。`subject` 是学科，`kind` 是题型，`source` 是来源名称。`created_at` 由 SQLite 写入 UTC 时间。

## 题目 content JSON

```json
{
  "schemaVersion": 2,
  "sourceNumber": "1",
  "tags": ["加法"],
  "warnings": [],
  "blocks": [
    {"id": "text_1", "type": "text", "version": 1, "text": "计算 \\(3+4=\\)"},
    {"id": "blank_1", "type": "blank", "version": 1, "display": {"widthEm": 5}},
    {"id": "text_2", "type": "text", "version": 1, "text": "。"}
  ]
}
```

`subject`、`kind` 不重复保存进 JSON。API 返回时将普通列与 JSON 合成题目对象。`warnings` 是编辑提醒，不进入试卷正文。

[blocks.schema.json](blocks.schema.json) 定义类型字段，[content.py](content.py) 完成 ID、图表长度、表格列数、几何引用等校验。`text` 字符串保留空格与换行，支持行内和独立 LaTeX。`option`、`subquestion`、`cell` 的 `text` 与 `children` 互斥。

这版未实现设计文档第 12.2 节的统一父子矩阵、容器对齐继承和统一参数规划。已有类型自己的容器规则及原有几何校验继续生效。

## 图片资产

`image.assetId` 引用资产表。`mime_type` 支持 `image/png` 和 `image/svg+xml`；JPEG/WebP 上传经清理后转为 PNG。PNG 去除元数据；SVG 仅接受自包含绘图元素和属性，不允许脚本、事件、外部资源、实体声明或 `foreignObject`。

未保存的图片暂存于草稿外层 `assets` 映射，保存请求示意：

```json
{
  "reviewed": true,
  "source": "示例题",
  "question": {
    "schemaVersion": 2,
    "sourceNumber": "1",
    "subject": "数学",
    "kind": "解答题",
    "tags": [],
    "warnings": [],
    "blocks": [{"id": "image_1", "type": "image", "version": 1, "assetId": "draft_image", "alt": "题目插图"}]
  },
  "assets": {
    "draft_image": {"mimeType": "image/png", "content": "这里填写实际图片的Base64编码"}
  }
}
```

`assets` 是上传传输字段，不写入题目 `content`。服务端递归查找图片，生成正式资产 ID，替换所有引用；同题重复引用只创建一份资产。引用已存在资产保存新题时，会复制资产字节并生成新 ID，原图保持不变。题目和资产在同一事务写入，失败全部回滚。

`GET /api/bank/assets/<id>` 返回对应 MIME，并设置 `nosniff` 和限制 SVG 活动内容的 CSP。

## 练习卷快照

`worksheet.items` 保存数组，每项为 `{"question":完整题目快照,"lines":作答留白行数}`。题目包含全部嵌套内容、图片引用、显示比例和公式对齐。`lines` 范围沿用 0～20。

题库后续变化不修改已有快照。资产引用不随快照重复存字节；未来添加删除功能时必须检查快照引用。本版未提供题目或资产删除接口。

## 查看本地内容

```sh
sqlite3 data/blocks-v2/notebook.sqlite3 'SELECT id,subject,kind,content FROM bank_question;'
sqlite3 data/blocks-v2/notebook.sqlite3 'SELECT id,question_id,mime_type,length(content) FROM bank_asset;'
```

完整离线示例在 [samples/blocks-v2.json](samples/blocks-v2.json)。该文件包含演示上传资产，数据库落盘后只保留资产引用。
