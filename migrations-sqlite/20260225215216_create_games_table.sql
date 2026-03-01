CREATE TABLE IF NOT EXISTS games (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT    NOT NULL,
    time        TEXT,
    opponent    TEXT    NOT NULL,
    home_away   TEXT    NOT NULL CHECK (home_away IN ('home', 'away')),
    venue       TEXT    NOT NULL,
    result      TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
