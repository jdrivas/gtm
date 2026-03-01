ALTER TABLE game_tickets ADD COLUMN assigned_to INTEGER REFERENCES users(id);
