import { db } from './database.js';
import { readFileSync, existsSync } from 'fs';
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
  correct_answer?: string;
  reference_value?: number;   // type N (Plus/Moins) uniquement
  timer: number;
}

const batchNum = process.argv[2] || '1';
const questionsPath = path.join(__dirname, `../../../questions-batch-${batchNum}.json`);

if (!existsSync(questionsPath)) {
  console.log(`File not found: ${questionsPath}`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(questionsPath, 'utf-8'));

// reference_value fait partie de l'INSERT : sans elle, une question N arrive
// en base sans son nombre et isPlayable() l'ecarte a jamais du tirage.
const insert = db.prepare(`
  INSERT INTO questions (type, category, text, options, option_a, option_b, correct_answer, reference_value, timer, active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

let imported = 0;
const transaction = db.transaction(() => {
  for (const q of data.questions as QuestionImport[]) {
    insert.run(
      q.type,
      q.category,
      q.text,
      q.options ? JSON.stringify(q.options) : null,
      q.option_a || null,
      q.option_b || null,
      q.correct_answer || null,
      typeof q.reference_value === 'number' ? q.reference_value : null,
      q.timer || 20
    );
    imported++;
  }
});

transaction();
console.log(`Batch ${batchNum}: Imported ${imported} questions`);

const total = (db.prepare('SELECT COUNT(*) as count FROM questions WHERE active = 1').get() as { count: number }).count;
console.log(`Total: ${total} questions`);
