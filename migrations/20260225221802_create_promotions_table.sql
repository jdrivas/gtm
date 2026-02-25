CREATE TABLE IF NOT EXISTS promotions (
    offer_id        INTEGER NOT NULL,
    game_pk         INTEGER NOT NULL REFERENCES games(game_pk),
    name            TEXT    NOT NULL,
    offer_type      TEXT,
    description     TEXT,
    distribution    TEXT,
    presented_by    TEXT,
    alt_page_url    TEXT,
    ticket_link     TEXT,
    thumbnail_url   TEXT,
    image_url       TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(offer_id, game_pk)
);
