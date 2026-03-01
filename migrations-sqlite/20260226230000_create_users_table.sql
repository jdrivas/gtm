CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    auth0_sub   TEXT    NOT NULL UNIQUE,
    email       TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'member',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
