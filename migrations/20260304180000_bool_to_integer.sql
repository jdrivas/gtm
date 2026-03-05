-- SQLx Any driver cannot decode BOOLEAN from SQLite.
-- Standardise on INTEGER (0/1) so the same Rust model works with both backends.
ALTER TABLE games ALTER COLUMN start_time_tbd TYPE INTEGER USING CASE WHEN start_time_tbd THEN 1 ELSE 0 END;
ALTER TABLE games ALTER COLUMN away_is_winner TYPE INTEGER USING CASE WHEN away_is_winner THEN 1 ELSE 0 END;
ALTER TABLE games ALTER COLUMN home_is_winner TYPE INTEGER USING CASE WHEN home_is_winner THEN 1 ELSE 0 END;
ALTER TABLE games ALTER COLUMN is_tie TYPE INTEGER USING CASE WHEN is_tie THEN 1 ELSE 0 END;
