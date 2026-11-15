-- PostgreSQL 14+ 目标结构（不是本地 SQLite Demo 自动使用的数据库）。
-- 在全新的专用数据库执行：psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f schema.sql
-- 不创建扩展、不删除现有数据；重复执行会失败并整体回滚。
BEGIN;
CREATE SCHEMA notebook;
SET LOCAL search_path TO notebook, public;

CREATE TABLE learner (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  alias text NOT NULL UNIQUE CHECK (length(alias) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
); -- 只存随机代号；不需要学生姓名、学校、身份证或生日。

CREATE TABLE exam (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  subject text NOT NULL DEFAULT '数学',
  grade smallint CHECK (grade BETWEEN 1 AND 12),
  exam_date date,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE exam_submission (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exam_id bigint NOT NULL REFERENCES exam(id),
  learner_id bigint NOT NULL REFERENCES learner(id),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','processing','needs_review','reviewed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, learner_id)
);
CREATE INDEX submission_learner_idx ON exam_submission(learner_id, created_at DESC);
CREATE INDEX submission_exam_idx ON exam_submission(exam_id);

-- 原始上传不可变；工作图单独存储。路径与 checksum 分开，便于证明来源。
CREATE TABLE image_asset (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id bigint NOT NULL REFERENCES exam_submission(id),
  kind text NOT NULL CHECK (kind IN ('original','normalized','crop','diagram')),
  parent_asset_id bigint REFERENCES image_asset(id),
  local_storage_key text NOT NULL UNIQUE CHECK (local_storage_key !~ '(^/|(^|/)\.\.(/|$))'),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,submission_id)
);
CREATE INDEX asset_submission_idx ON image_asset(submission_id);
CREATE INDEX asset_parent_idx ON image_asset(parent_asset_id);
CREATE TABLE page_image (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id bigint NOT NULL REFERENCES exam_submission(id),
  original_asset_id bigint NOT NULL,
  normalized_asset_id bigint NOT NULL,
  FOREIGN KEY(original_asset_id,submission_id) REFERENCES image_asset(id,submission_id),
  FOREIGN KEY(normalized_asset_id,submission_id) REFERENCES image_asset(id,submission_id),
  page_number integer NOT NULL CHECK (page_number > 0),
  local_storage_key text NOT NULL UNIQUE CHECK (local_storage_key !~ '(^/|(^|/)\.\.(/|$))'),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  width_px integer NOT NULL CHECK (width_px > 0),
  height_px integer NOT NULL CHECK (height_px > 0),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  rotation_degrees integer NOT NULL DEFAULT 0 CHECK (rotation_degrees IN (0,90,180,270)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id,page_number), UNIQUE(id,submission_id)
);
CREATE INDEX image_sha_idx ON page_image(sha256); -- 不全局唯一：不同提交可有相同图片。

CREATE TABLE ocr_job (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id bigint NOT NULL REFERENCES page_image(id),
  pipeline_stage text NOT NULL DEFAULT 'ocr' CHECK (pipeline_stage IN ('preprocess','layout','ocr','structure')),
  engine text NOT NULL,
  engine_version text NOT NULL,
  language text NOT NULL DEFAULT 'chi_sim+eng',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at),
  UNIQUE(id,page_id)
);
CREATE INDEX ocr_queue_idx ON ocr_job(created_at) WHERE state = 'queued';
CREATE INDEX ocr_page_idx ON ocr_job(page_id,created_at DESC);
CREATE TABLE ocr_result (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id bigint NOT NULL,
  page_id bigint NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  raw_text text NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,4) CHECK (confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(job_id,page_id) REFERENCES ocr_job(id,page_id),
  UNIQUE(job_id,version), UNIQUE(id,page_id)
); -- 原始识别结果追加保留，人工校对不覆盖原文。

CREATE TABLE question (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id bigint NOT NULL REFERENCES exam_submission(id),
  number_label text NOT NULL DEFAULT '',
  question_type text NOT NULL DEFAULT 'other' CHECK (question_type IN ('choice','fill','calculation','proof','application','other')),
  stem_text text NOT NULL DEFAULT '',
  stem_latex text NOT NULL DEFAULT '',
  choices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(choices) = 'array'),
  reference_answer text NOT NULL DEFAULT '',
  solution_text text NOT NULL DEFAULT '',
  max_score numeric(7,2) CHECK (max_score >= 0),
  review_status text NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft','needs_review','verified')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (review_status <> 'verified' OR (length(trim(stem_text)) > 0 AND verified_at IS NOT NULL)),
  UNIQUE(id,submission_id)
);
CREATE INDEX question_submission_idx ON question(submission_id);
CREATE INDEX question_review_idx ON question(review_status);
-- 识别/人工校对的印刷题目版本：与学生手写答案、教师批改完全分开。
CREATE TABLE question_version (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id bigint NOT NULL REFERENCES question(id),
  version integer NOT NULL CHECK (version > 0),
  printed_text text NOT NULL DEFAULT '',
  formula_latex text NOT NULL DEFAULT '',
  diagram_description text NOT NULL DEFAULT '',
  source text NOT NULL CHECK (source IN ('ocr','manual')),
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id,version)
);
CREATE TABLE question_region (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id bigint NOT NULL,
  submission_id bigint NOT NULL,
  page_id bigint NOT NULL,
  source_ocr_result_id bigint,
  kind text NOT NULL DEFAULT 'question' CHECK (kind IN ('question','diagram','student_answer','reference')),
  -- 归一化坐标 [0,1]，原点左上；相对于已纠正方向的原图，不是缩略图。
  x numeric(9,8) NOT NULL CHECK (x >= 0 AND x < 1),
  y numeric(9,8) NOT NULL CHECK (y >= 0 AND y < 1),
  width numeric(9,8) NOT NULL CHECK (width > 0 AND width <= 1),
  height numeric(9,8) NOT NULL CHECK (height > 0 AND height <= 1),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  CHECK (x + width <= 1 AND y + height <= 1),
  FOREIGN KEY(question_id,submission_id) REFERENCES question(id,submission_id),
  FOREIGN KEY(page_id,submission_id) REFERENCES page_image(id,submission_id),
  FOREIGN KEY(source_ocr_result_id,page_id) REFERENCES ocr_result(id,page_id)
);
CREATE INDEX region_question_idx ON question_region(question_id,sort_order);
CREATE INDEX region_page_idx ON question_region(page_id);
CREATE INDEX region_ocr_idx ON question_region(source_ocr_result_id);

CREATE TABLE knowledge_point (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id bigint REFERENCES knowledge_point(id),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  CHECK(parent_id IS NULL OR parent_id <> id)
); -- 更长的树循环由服务层在事务中校验。
CREATE INDEX knowledge_parent_idx ON knowledge_point(parent_id);
CREATE TABLE question_knowledge (
  question_id bigint NOT NULL REFERENCES question(id),
  knowledge_id bigint NOT NULL REFERENCES knowledge_point(id),
  PRIMARY KEY(question_id,knowledge_id)
);
CREATE INDEX question_knowledge_reverse_idx ON question_knowledge(knowledge_id,question_id);

CREATE TABLE question_attempt (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id bigint NOT NULL,
  submission_id bigint NOT NULL,
  learner_id bigint NOT NULL,
  student_answer text NOT NULL DEFAULT '',
  is_wrong boolean NOT NULL DEFAULT true,
  handwriting_ocr_text text NOT NULL DEFAULT '',
  earned_score numeric(7,2) CHECK (earned_score >= 0),
  error_reason text NOT NULL DEFAULT '', -- 未经人工确认不推断孩子出错原因。
  teacher_note text NOT NULL DEFAULT '',
  mastery text NOT NULL DEFAULT 'new' CHECK (mastery IN ('new','practicing','mastered')),
  next_review_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(question_id,submission_id) REFERENCES question(id,submission_id),
  FOREIGN KEY(submission_id,learner_id) REFERENCES exam_submission(id,learner_id),
  UNIQUE(question_id,learner_id)
);
CREATE INDEX wrong_learner_idx ON question_attempt(learner_id,mastery);
CREATE INDEX wrong_due_idx ON question_attempt(learner_id,next_review_at) WHERE mastery <> 'mastered';
CREATE INDEX wrong_submission_idx ON question_attempt(submission_id);
CREATE TABLE grading_observation (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_attempt_id bigint NOT NULL REFERENCES question_attempt(id),
  region_id bigint REFERENCES question_region(id),
  mark_text text NOT NULL DEFAULT '',
  points_awarded numeric(7,2) CHECK (points_awarded >= 0),
  observed_result text CHECK(observed_result IN ('correct','partial','incorrect','unknown')),
  source text NOT NULL CHECK(source IN ('ocr','manual')),
  human_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
); -- OCR 读取教师批注是观察，不直接等于判分真值；服务层校验 region 属于对应题目。
CREATE INDEX grading_attempt_idx ON grading_observation(question_attempt_id);
CREATE INDEX grading_region_idx ON grading_observation(region_id);
CREATE TABLE review_record (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_attempt_id bigint NOT NULL REFERENCES question_attempt(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  answer_text text NOT NULL DEFAULT '',
  outcome text NOT NULL CHECK (outcome IN ('correct','partial','incorrect','skipped')),
  note text NOT NULL DEFAULT ''
);
CREATE INDEX review_attempt_idx ON review_record(question_attempt_id,reviewed_at DESC);
CREATE TABLE question_revision (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id bigint NOT NULL REFERENCES question(id),
  revision integer NOT NULL CHECK(revision > 0),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot) = 'object'),
  change_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id,revision)
);

-- revision/updated_at 自动维护；服务层仍需 WHERE revision=:expected 做乐观锁。
CREATE FUNCTION question_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END; $$;
CREATE TRIGGER question_touch BEFORE UPDATE ON question FOR EACH ROW EXECUTE FUNCTION question_touch();
CREATE FUNCTION question_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notebook.question_revision(question_id,revision,snapshot)
  VALUES(NEW.id,NEW.revision,to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER question_audit AFTER INSERT OR UPDATE ON question FOR EACH ROW EXECUTE FUNCTION question_audit();
COMMIT;
