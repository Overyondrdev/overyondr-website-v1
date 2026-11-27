-- Migration number: 0001 	 Ad portal schema (yondr-ad-portal-db)
-- Ad files live in R2 (yondr-ad-portal-assets); D1 holds their records and each file's R2 key.
-- People are identified by their Cloudflare Access email (Cf-Access-Authenticated-User-Email).

-- A set of ads made together, e.g. the Harvard study ads. `copy` is JSON: headlines, descriptions, CTA, sizes.
CREATE TABLE ad_sets (
  id TEXT PRIMARY KEY,                     -- slug, e.g. harvard-study-2026
  name TEXT NOT NULL,
  summary TEXT,
  study_url TEXT,                          -- optional reference links shown on the set page
  release_url TEXT,
  copy TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One ad file (one size, one version).
CREATE TABLE ads (
  id TEXT PRIMARY KEY,                     -- e.g. harvard-study-2026-h1-pouch-300x250
  set_id TEXT NOT NULL REFERENCES ad_sets(id),
  title TEXT NOT NULL,
  headline TEXT,                           -- the headline the ad shows
  variant TEXT NOT NULL DEFAULT 'other',   -- pouch | in-use | motion | other
  kind TEXT NOT NULL,                      -- still | motion
  format TEXT NOT NULL,                    -- JPEG | GIF | PNG | WEBP
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_review', -- in_review | approved | needs_changes | archived
  campaign_start TEXT,                     -- YYYY-MM-DD
  campaign_end TEXT,
  meta TEXT NOT NULL DEFAULT '{}',         -- JSON: headline id, description, animation length, frames
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ads_set ON ads(set_id, status);

-- Supporting files for a set (pouch cut-out, photos) for making other formats.
CREATE TABLE set_files (
  r2_key TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES ad_sets(id),
  name TEXT NOT NULL,
  alt TEXT,
  content_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Where the ads run.
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id TEXT NOT NULL REFERENCES ad_sets(id),
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'google-display',
  status TEXT NOT NULL DEFAULT 'planned',  -- planned | live | paused | ended
  start_date TEXT,
  end_date TEXT,
  owner_email TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX campaigns_set ON campaigns(set_id);

CREATE TABLE campaign_ads (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  ad_id TEXT NOT NULL REFERENCES ads(id),
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, ad_id)
);
CREATE INDEX campaign_ads_ad ON campaign_ads(ad_id);

-- One review per person per ad: 1 = approve, -1 = needs changes.
CREATE TABLE reviews (
  ad_id TEXT NOT NULL REFERENCES ads(id),
  email TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (ad_id, email)
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id TEXT NOT NULL REFERENCES ads(id),
  author_email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',      -- design | content | bug | idea | question | praise | other
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX comments_ad ON comments(ad_id, created_at);

CREATE TABLE downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX downloads_ad ON downloads(ad_id);
