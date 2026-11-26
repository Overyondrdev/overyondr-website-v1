-- Generated from src/schema.js (applied automatically by the Worker on first request).
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    added_by TEXT NOT NULL,             -- email of the staff member who added the client
    updated_by TEXT,
    name TEXT NOT NULL,                 -- name on the envelope
    company TEXT,
    title TEXT,
    line1 TEXT NOT NULL,
    line2 TEXT,
    city TEXT NOT NULL,
    region TEXT,                        -- state / province / county
    postal_code TEXT,
    country TEXT NOT NULL DEFAULT 'US', -- ISO 3166-1 alpha-2
    email TEXT,
    notes TEXT,
    status TEXT NOT NULL,               -- verified | needs_review | unverified
    kept_as_entered INTEGER NOT NULL DEFAULT 0, -- 1 = person saved despite a suggestion or issue
    reviewed_by TEXT,                   -- admin who marked a flagged address as OK
    verification TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'single', -- single | bulk
    upload_id INTEGER,
    dedupe_key TEXT NOT NULL,
    department TEXT                     -- Yondr department the client is sent on behalf of
  );

CREATE INDEX IF NOT EXISTS clients_added_by ON clients(added_by, created_at);

CREATE INDEX IF NOT EXISTS clients_dedupe ON clients(dedupe_key);

CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    added_by TEXT NOT NULL,
    filename TEXT,
    row_count INTEGER NOT NULL DEFAULT 0
  );

CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,               -- added | imported | edited | deleted | reviewed
    client_id INTEGER,
    detail TEXT NOT NULL DEFAULT '{}'
  );

CREATE INDEX IF NOT EXISTS activity_time ON activity(created_at);

CREATE TABLE IF NOT EXISTS admins (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'admin', -- owner | admin
    added_by TEXT,
    added_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    tutorial_done_at TEXT,              -- set when the person finishes or skips the first-visit tour
    department TEXT                     -- last department they picked (pre-fills the form)
  );

CREATE TABLE IF NOT EXISTS login_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,            -- sha256(email:code), never the code itself
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    ip TEXT
  );

CREATE INDEX IF NOT EXISTS login_codes_email ON login_codes(email, created_at);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,        -- sha256 of the cookie value
    email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS verify_cache (
    key TEXT PRIMARY KEY,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
