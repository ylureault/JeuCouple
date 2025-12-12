import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/database.sqlite');

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // Create tables
  db.exec(`
    -- Rooms table
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      player1_name TEXT,
      player2_name TEXT,
      status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting', 'playing', 'finished')),
      created_at TEXT DEFAULT (datetime('now')),
      last_activity TEXT DEFAULT (datetime('now'))
    );

    -- Questions table
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('A', 'B', 'C', 'D')),
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      options TEXT,
      timer INTEGER DEFAULT 20,
      active INTEGER DEFAULT 1
    );

    -- Games table
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      score_player1 INTEGER DEFAULT 0,
      score_player2 INTEGER DEFAULT 0,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    -- Answers table
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL CHECK(player_id IN (1, 2)),
      answer TEXT NOT NULL,
      answered_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    -- Admin table
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
    CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
    CREATE INDEX IF NOT EXISTS idx_games_room ON games(room_id);
    CREATE INDEX IF NOT EXISTS idx_answers_game ON answers(game_id);
    CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(active);
  `);

  console.log('Database initialized successfully');
}

export function cleanupExpiredRooms() {
  const result = db.prepare(`
    DELETE FROM rooms
    WHERE datetime(last_activity) < datetime('now', '-7 days')
  `).run();

  if (result.changes > 0) {
    console.log(`Cleaned up ${result.changes} expired rooms`);
  }
}
