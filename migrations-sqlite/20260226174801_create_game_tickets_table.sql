CREATE TABLE IF NOT EXISTS game_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_pk INTEGER NOT NULL REFERENCES games(game_pk),
    seat_id INTEGER NOT NULL REFERENCES seats(id),
    status TEXT NOT NULL DEFAULT 'available',
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(game_pk, seat_id)
);
