CREATE TABLE IF NOT EXISTS user_game_tags (
    user_id   INTEGER NOT NULL REFERENCES users(id),
    game_pk   BIGINT  NOT NULL,
    shortlist INTEGER NOT NULL DEFAULT 0,
    cant_go   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, game_pk)
);
