-- Ad library schema (mirrors the ad_* entries in src/worker/feedback/schema.js, which also applies it automatically).
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_set TEXT NOT NULL,                  -- creative set, e.g. harvard-study-2026
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'google-display',
  status TEXT NOT NULL DEFAULT 'planned', -- planned | live | paused | ended
  start_date TEXT, end_date TEXT,
  landing_url TEXT,
  utm_campaign TEXT,
  owner_email TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ad_campaign_items (
  campaign_id INTEGER NOT NULL,
  creative_id TEXT NOT NULL,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, creative_id)
);

CREATE INDEX IF NOT EXISTS ad_items_creative ON ad_campaign_items(creative_id);

CREATE TABLE IF NOT EXISTS ad_reactions (
  creative_id TEXT NOT NULL,
  email TEXT NOT NULL,
  value INTEGER NOT NULL,                -- 1 approve / -1 needs changes
  created_at TEXT NOT NULL,
  PRIMARY KEY (creative_id, email)
);

CREATE TABLE IF NOT EXISTS ad_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creative_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ad_downloads_creative ON ad_downloads(creative_id);
