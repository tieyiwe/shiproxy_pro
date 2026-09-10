-- A shipper who messaged a lister can rate them once per conversation.
-- Aggregate is cached on users (rating_avg/rating_count) since it needs to
-- be sortable/filterable and changes rarely relative to how often it's read.

CREATE TABLE IF NOT EXISTS ratings (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  rater_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ratee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, rater_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3, 2),
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;
