-- Feedback tool schema (mirrors src/worker/feedback/schema.js, which also applies it automatically).
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    author_email TEXT NOT NULL,
    site TEXT NOT NULL,                -- v1 | v2 | portal
    url TEXT NOT NULL,
    path TEXT NOT NULL,
    page_title TEXT,
    type TEXT NOT NULL,                -- bug | design | content | idea | question | praise | other
    priority TEXT NOT NULL DEFAULT 'normal',  -- low | normal | high | critical
    status TEXT NOT NULL DEFAULT 'new',       -- new | reviewing | agreed | planned | done | wont_do
    title TEXT,
    message TEXT NOT NULL,
    assignee TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    context TEXT NOT NULL DEFAULT '{}',
    score INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    attachment_count INTEGER NOT NULL DEFAULT 0
  );
CREATE INDEX IF NOT EXISTS feedback_author ON feedback(author_email, created_at);
CREATE INDEX IF NOT EXISTS feedback_status ON feedback(status, created_at);
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    feedback_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'screenshot',
    content_type TEXT NOT NULL,
    width INTEGER, height INTEGER, bytes INTEGER,
    created_at TEXT NOT NULL
  );
CREATE INDEX IF NOT EXISTS attachments_feedback ON attachments(feedback_id);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER NOT NULL,
    author_email TEXT NOT NULL,
    body TEXT NOT NULL,
    internal INTEGER NOT NULL DEFAULT 0,  -- 1 = admin-only note
    created_at TEXT NOT NULL
  );
CREATE INDEX IF NOT EXISTS comments_feedback ON comments(feedback_id, created_at);
CREATE TABLE IF NOT EXISTS votes (
    feedback_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    value INTEGER NOT NULL,              -- 1 agree / -1 disagree
    created_at TEXT NOT NULL,
    PRIMARY KEY (feedback_id, email)
  );
CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
CREATE INDEX IF NOT EXISTS activity_feedback ON activity(feedback_id, created_at);
CREATE TABLE IF NOT EXISTS admins (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'admin',  -- owner | admin
    added_by TEXT,
    added_at TEXT NOT NULL
  );
CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    item_count INTEGER NOT NULL,
    content TEXT NOT NULL
  );
