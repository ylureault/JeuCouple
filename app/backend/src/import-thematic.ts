import { db } from './database.js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface QuestionImport {
  type: string;
  category: string;
  text: string;
  options?: string[];
  option_a?: string;
  option_b?: string;
  emoji_a?: string;
  emoji_b?: string;
  correct_answer?: string;
  timer: number;
}

interface CategoryImport {
  code: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  sort_order: number;
}

const dataPath = path.join(__dirname, '../data');

// Thematic categories to add
const thematicCategories: CategoryImport[] = [
  { code: 'fellation', name: 'Fellation', icon: '👄', color: '#ec4899', description: 'Questions sur les plaisirs oraux masculins', sort_order: 100 },
  { code: 'cunnilingus', name: 'Cunnilingus', icon: '👅', color: '#d946ef', description: 'Questions sur les plaisirs oraux féminins', sort_order: 101 },
  { code: 'sodomie', name: 'Sodomie', icon: '🍑', color: '#f97316', description: 'Questions sur le plaisir anal', sort_order: 102 },
  { code: '69', name: 'Position 69', icon: '🔄', color: '#8b5cf6', description: 'Plaisir mutuel simultané', sort_order: 103 },
  { code: 'kamasutra', name: 'Kamasutra', icon: '🧘', color: '#f59e0b', description: 'Positions et techniques', sort_order: 104 },
  { code: 'fantasmes', name: 'Fantasmes', icon: '💭', color: '#a855f7', description: 'Désirs secrets et inavoués', sort_order: 105 },
  { code: 'jeux_role', name: 'Jeux de rôle', icon: '🎭', color: '#10b981', description: 'Scénarios coquins', sort_order: 106 },
  { code: 'bdsm', name: 'BDSM', icon: '⛓️', color: '#374151', description: 'Domination et soumission', sort_order: 107 },
  { code: 'preliminaires', name: 'Préliminaires', icon: '💋', color: '#f43f5e', description: 'L\'art de faire monter le désir', sort_order: 108 },
  { code: 'public', name: 'Sexe en public', icon: '🏖️', color: '#0ea5e9', description: 'Oser en dehors de la chambre', sort_order: 109 },
  { code: 'extreme', name: 'Ultra coquin', icon: '🔞', color: '#dc2626', description: 'Pour les couples audacieux', sort_order: 110 },
];

// Add thematic categories
const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (code, name, icon, color, description, sort_order, active)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`);

console.log('Adding thematic categories...');
for (const cat of thematicCategories) {
  insertCategory.run(cat.code, cat.name, cat.icon, cat.color, cat.description, cat.sort_order);
}
console.log(`Added ${thematicCategories.length} thematic categories`);

// Import questions from all JSON files in data folder
const insertQuestion = db.prepare(`
  INSERT INTO questions (type, category, text, options, option_a, option_b, emoji_a, emoji_b, correct_answer, timer, active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

// Check for duplicates
const checkDuplicate = db.prepare(`
  SELECT id FROM questions WHERE text = ? AND category = ?
`);

let totalImported = 0;
let totalSkipped = 0;

const files = readdirSync(dataPath).filter(f => f.endsWith('.json'));
console.log(`Found ${files.length} JSON files to import`);

const transaction = db.transaction(() => {
  for (const file of files) {
    const filePath = path.join(dataPath, file);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));

    if (!data.questions || !Array.isArray(data.questions)) {
      console.log(`Skipping ${file}: no questions array`);
      continue;
    }

    let fileImported = 0;
    let fileSkipped = 0;

    for (const q of data.questions as QuestionImport[]) {
      // Check for duplicate
      const existing = checkDuplicate.get(q.text, q.category);
      if (existing) {
        fileSkipped++;
        continue;
      }

      insertQuestion.run(
        q.type,
        q.category,
        q.text,
        q.options ? JSON.stringify(q.options) : null,
        q.option_a || null,
        q.option_b || null,
        q.emoji_a || null,
        q.emoji_b || null,
        q.correct_answer || null,
        q.timer || 20
      );
      fileImported++;
    }

    console.log(`${file}: imported ${fileImported}, skipped ${fileSkipped} duplicates`);
    totalImported += fileImported;
    totalSkipped += fileSkipped;
  }
});

transaction();

console.log(`\nTotal: imported ${totalImported} questions, skipped ${totalSkipped} duplicates`);

// Show category stats
const stats = db.prepare(`
  SELECT category, COUNT(*) as count
  FROM questions
  WHERE active = 1
  GROUP BY category
  ORDER BY count DESC
`).all() as { category: string; count: number }[];

console.log('\nQuestions by category:');
for (const stat of stats) {
  console.log(`  ${stat.category}: ${stat.count}`);
}

const total = (db.prepare('SELECT COUNT(*) as count FROM questions WHERE active = 1').get() as { count: number }).count;
console.log(`\nTotal active questions: ${total}`);
