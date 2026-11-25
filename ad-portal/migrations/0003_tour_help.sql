-- Migration number: 0003 	 First-visit tour and help center feedback.
-- users.tour_role: the highest role whose tour this person has seen (viewer | editor | admin). When someone's role
-- goes up, their next visit shows a short tour of just the new features.
ALTER TABLE users ADD COLUMN tour_role TEXT;

CREATE TABLE help_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article TEXT NOT NULL,
  helpful INTEGER,                         -- 1 yes / 0 no / NULL (comment only)
  comment TEXT,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX help_feedback_time ON help_feedback(created_at);
