import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/database.sqlite');

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // Create tables
  db.exec(`
    -- Question Types table (administrable)
    CREATE TABLE IF NOT EXISTS question_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      scoring_mode TEXT NOT NULL DEFAULT 'match' CHECK(scoring_mode IN ('match', 'consensus', 'proximity', 'none')),
      input_type TEXT NOT NULL DEFAULT 'options' CHECK(input_type IN ('options', 'binary', 'scale', 'text', 'who')),
      icon TEXT,
      color TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Categories table (administrable)
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      description TEXT,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

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

    -- Questions table (updated with foreign keys)
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      options TEXT,
      option_a TEXT,
      option_b TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(active);
    CREATE INDEX IF NOT EXISTS idx_question_types_active ON question_types(active);
  `);

  // Insert default question types if not exists
  initDefaultQuestionTypes();
  initDefaultCategories();

  console.log('Database initialized successfully');
}

function initDefaultQuestionTypes() {
  const types = [
    {
      code: 'A',
      name: 'Devine sa reponse',
      description: 'Devinez ce que votre partenaire va repondre',
      scoring_mode: 'match',
      input_type: 'options',
      icon: '🎯',
      color: '#e21b3c'
    },
    {
      code: 'B',
      name: 'Repondez pareil',
      description: 'Points si vos reponses sont identiques',
      scoring_mode: 'match',
      input_type: 'options',
      icon: '🤝',
      color: '#1368ce'
    },
    {
      code: 'C',
      name: 'Question ouverte',
      description: 'Reponse libre, pas de scoring',
      scoring_mode: 'none',
      input_type: 'text',
      icon: '💬',
      color: '#d89e00'
    },
    {
      code: 'D',
      name: 'Echelle',
      description: 'Choisissez un chiffre de 1 a 10',
      scoring_mode: 'proximity',
      input_type: 'scale',
      icon: '📊',
      color: '#26890c'
    },
    {
      code: 'E',
      name: 'Tu es plutot...',
      description: 'Choix entre deux options',
      scoring_mode: 'match',
      input_type: 'binary',
      icon: '⚖️',
      color: '#9b59b6'
    },
    {
      code: 'F',
      name: 'Qui de nous deux',
      description: 'Qui correspond le mieux a la description?',
      scoring_mode: 'consensus',
      input_type: 'who',
      icon: '👫',
      color: '#e91e63'
    }
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO question_types (code, name, description, scoring_mode, input_type, icon, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const type of types) {
    insert.run(type.code, type.name, type.description, type.scoring_mode, type.input_type, type.icon, type.color);
  }
}

function initDefaultCategories() {
  const categories = [
    { code: 'couple', name: 'Couple', icon: '❤️', color: '#e91e63', description: 'Questions sur votre relation', sort_order: 1 },
    { code: 'preferences', name: 'Preferences', icon: '⭐', color: '#ff9800', description: 'Gouts et preferences', sort_order: 2 },
    { code: 'habitudes', name: 'Habitudes', icon: '🏠', color: '#4caf50', description: 'Vie quotidienne', sort_order: 3 },
    { code: 'souvenirs', name: 'Souvenirs', icon: '📸', color: '#2196f3', description: 'Moments partages', sort_order: 4 },
    { code: 'projets', name: 'Projets', icon: '🚀', color: '#9c27b0', description: 'Avenir et reves', sort_order: 5 },
    { code: 'sexy', name: 'Sexy', icon: '🔥', color: '#f44336', description: 'Questions coquines', sort_order: 6 },
    { code: 'coquin', name: 'Coquin', icon: '😈', color: '#e91e63', description: 'Pour pimenter', sort_order: 7 },
    { code: 'fun', name: 'Fun', icon: '🎉', color: '#ffeb3b', description: 'Questions fun et legeres', sort_order: 8 }
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO categories (code, name, icon, color, description, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const cat of categories) {
    insert.run(cat.code, cat.name, cat.icon, cat.color, cat.description, cat.sort_order);
  }
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
