CREATE TABLE IF NOT EXISTS ticket_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id),
    game_pk         INTEGER NOT NULL REFERENCES games(game_pk),
    seats_requested INTEGER NOT NULL,
    seats_approved  INTEGER NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'pending',
    notes           TEXT,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at      DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, game_pk)
);
