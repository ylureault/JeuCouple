import { db, initDatabase } from './database.js';
import { readFileSync, readdirSync } from 'fs';
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
  reference_value?: number;   // type N (Plus/Moins) uniquement
  timer: number;
}

const dataPath = path.join(__dirname, '../data');

// Cree les tables et seed les categories/types (idempotent).
// Les categories sont definies une seule fois, dans database.ts.
initDatabase();

// Garde-fou : une question dont la categorie n'est pas enregistree serait
// importee en base mais resterait injouable (le selecteur de themes ne liste
// que la table categories). On refuse l'import plutot que de perdre la question.
const knownCategories = new Set(
  (db.prepare('SELECT code FROM categories').all() as { code: string }[]).map(r => r.code)
);

// Import questions from all JSON files in data folder
// reference_value fait partie de l'INSERT : oublie ici, une question N
// importee arriverait en base sans son nombre, donc injouable a jamais
// (l'import saute ensuite le doublon, il n'y a pas de seconde chance).
const insertQuestion = db.prepare(`
  INSERT INTO questions (type, category, text, options, option_a, option_b, emoji_a, emoji_b, correct_answer, reference_value, timer, active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

// Check for duplicates
const checkDuplicate = db.prepare(`
  SELECT id FROM questions WHERE text = ? AND category = ?
`);

let totalImported = 0;
let totalSkipped = 0;
let totalRejected = 0;

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
      // Categorie inconnue => la question serait injouable. On alerte au lieu d'importer silencieusement.
      if (!knownCategories.has(q.category)) {
        console.error(`  ERREUR ${file}: categorie inconnue "${q.category}" - question ignoree: "${q.text.slice(0, 60)}"`);
        totalRejected++;
        continue;
      }

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
        typeof q.reference_value === 'number' ? q.reference_value : null,
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
if (totalRejected > 0) {
  console.error(`ATTENTION: ${totalRejected} questions rejetees (categorie inconnue). Ajoutez la categorie dans database.ts.`);
}

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
