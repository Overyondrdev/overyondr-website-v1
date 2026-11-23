// D1 schema, applied idempotently on the first request (CREATE ... IF NOT EXISTS).
// Keep schema.sql in sync for anyone applying it by hand.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS clients (
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
    dedupe_key TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS clients_added_by ON clients(added_by, created_at)`,
  `CREATE INDEX IF NOT EXISTS clients_dedupe ON clients(dedupe_key)`,
  `CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    added_by TEXT NOT NULL,
    filename TEXT,
    row_count INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,               -- added | imported | edited | deleted | reviewed
    client_id INTEGER,
    detail TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE INDEX IF NOT EXISTS activity_time ON activity(created_at)`,
  `CREATE TABLE IF NOT EXISTS admins (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'admin', -- owner | admin
    added_by TEXT,
    added_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS verify_cache (
    key TEXT PRIMARY KEY,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

let ready = null;
export function ensureSchema(db) {
  if (!ready) ready = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => { ready = null; throw e; });
  return ready;
}
