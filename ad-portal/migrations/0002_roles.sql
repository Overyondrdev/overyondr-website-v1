-- Migration number: 0002 	 Roles (viewer / editor / admin) and an activity log.
-- Everyone who signs in through Cloudflare Access is a viewer unless listed here. Owners (OWNER_EMAILS in
-- wrangler.toml) are always admins and can't be demoted from the portal.

CREATE TABLE users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'viewer',   -- viewer | editor | admin
  added_by TEXT,                         -- who set the role (NULL: first seen, default role)
  first_seen_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,                  -- role_set | role_removed | copy_updated | ads_rerendered
  target TEXT,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX activity_time ON activity(created_at);
