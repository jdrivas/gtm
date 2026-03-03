CREATE TABLE users_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    auth0_sub   TEXT    NOT NULL UNIQUE,
    email       TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, auth0_sub, email, name, created_at, updated_at)
    SELECT id, auth0_sub, email, name, created_at, updated_at FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;
