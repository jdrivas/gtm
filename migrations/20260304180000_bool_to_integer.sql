-- SQLx Any driver cannot decode BOOLEAN from SQLite.
-- Standardise on INTEGER (0/1) so the same Rust model works with both backends.

-- Drop boolean defaults first (Postgres cannot auto-cast default values)
ALTER TABLE games ALTER COLUMN start_time_tbd DROP DEFAULT;
ALTER TABLE games ALTER COLUMN is_tie DROP DEFAULT;

-- Convert columns
ALTER TABLE games ALTER COLUMN start_time_tbd TYPE INTEGER USING CASE WHEN start_time_tbd THEN 1 ELSE 0 END;
ALTER TABLE games ALTER COLUMN away_is_winner TYPE INTEGER USING CASE WHEN away_is_winner THEN 1 ELSE 0 END;
ALTER TABLE games ALTER COLUMN home_is_winner TYPE INTEGER USING CASE WHEN home_is_winner THEN 1 ELSE 0 END;
ALTER TABLE games ALTER COLUMN is_tie TYPE INTEGER USING CASE WHEN is_tie THEN 1 ELSE 0 END;

-- Re-add defaults as integers
ALTER TABLE games ALTER COLUMN start_time_tbd SET DEFAULT 0;
ALTER TABLE games ALTER COLUMN is_tie SET DEFAULT 0;
