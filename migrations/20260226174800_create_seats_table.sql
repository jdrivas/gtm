CREATE TABLE IF NOT EXISTS seats (
    id SERIAL PRIMARY KEY,
    section TEXT NOT NULL,
    row TEXT NOT NULL,
    seat TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(section, row, seat)
);
