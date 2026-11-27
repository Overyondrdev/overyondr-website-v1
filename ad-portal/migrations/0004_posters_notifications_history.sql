-- Migration number: 0004 	 Motion posters, notifications and copy history.

-- A still image (the end card) for each motion ad, shown in the grid instead of the GIF so the library loads fast.
ALTER TABLE ads ADD COLUMN poster_key TEXT;

-- In-app notifications (the bell). One row per recipient.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,                     -- recipient
  kind TEXT NOT NULL,                      -- suggestion | comment | review_needed | changes_requested | role
  actor TEXT,
  set_id TEXT,
  ad_id TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX notifications_inbox ON notifications(email, read_at, id);

-- Every saved version of a set's copy, so editors can see what changed and restore an earlier version.
CREATE TABLE copy_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id TEXT NOT NULL REFERENCES ad_sets(id),
  copy TEXT NOT NULL,
  changed TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX copy_versions_set ON copy_versions(set_id, id);
