import { db } from '../database.js';
import type { Question, QuestionType, QuestionImport } from '../../../shared/types.js';

interface QuestionRow {
  id: number;
  type: QuestionType;
  category: string;
  text: string;
  options: string | null;
  timer: number;
  active: number;
}

function rowToQuestion(row: QuestionRow): Question {
  return {
    ...row,
    options: row.options ? JSON.parse(row.options) : undefined,
    active: Boolean(row.active)
  };
}

export function getAllQuestions(): Question[] {
  const rows = db.prepare('SELECT * FROM questions ORDER BY category, id').all() as QuestionRow[];
  return rows.map(rowToQuestion);
}

export function getActiveQuestions(): Question[] {
  const rows = db.prepare('SELECT * FROM questions WHERE active = 1 ORDER BY category, id').all() as QuestionRow[];
  return rows.map(rowToQuestion);
}

export function getQuestionById(id: number): Question | undefined {
  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as QuestionRow | undefined;
  return row ? rowToQuestion(row) : undefined;
}

export function getRandomQuestions(count: number): Question[] {
  const rows = db.prepare(`
    SELECT * FROM questions
    WHERE active = 1
    ORDER BY RANDOM()
    LIMIT ?
  `).all(count) as QuestionRow[];
  return rows.map(rowToQuestion);
}

export function createQuestion(question: Omit<Question, 'id' | 'active'>): Question {
  const result = db.prepare(`
    INSERT INTO questions (type, category, text, options, timer, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(
    question.type,
    question.category,
    question.text,
    question.options ? JSON.stringify(question.options) : null,
    question.timer || 20
  );

  return getQuestionById(result.lastInsertRowid as number)!;
}

export function updateQuestion(id: number, question: Partial<Omit<Question, 'id'>>): Question | null {
  const existing = getQuestionById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (question.type !== undefined) {
    updates.push('type = ?');
    values.push(question.type);
  }
  if (question.category !== undefined) {
    updates.push('category = ?');
    values.push(question.category);
  }
  if (question.text !== undefined) {
    updates.push('text = ?');
    values.push(question.text);
  }
  if (question.options !== undefined) {
    updates.push('options = ?');
    values.push(JSON.stringify(question.options));
  }
  if (question.timer !== undefined) {
    updates.push('timer = ?');
    values.push(question.timer);
  }
  if (question.active !== undefined) {
    updates.push('active = ?');
    values.push(question.active ? 1 : 0);
  }

  if (updates.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE questions SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  return getQuestionById(id)!;
}

export function deleteQuestion(id: number): boolean {
  const result = db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  return result.changes > 0;
}

export function importQuestions(data: QuestionImport): number {
  const insert = db.prepare(`
    INSERT INTO questions (type, category, text, options, timer, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  let imported = 0;
  const transaction = db.transaction(() => {
    for (const q of data.questions) {
      insert.run(
        q.type,
        q.category,
        q.text,
        q.options ? JSON.stringify(q.options) : null,
        q.timer || 20
      );
      imported++;
    }
  });

  transaction();
  return imported;
}

export function exportQuestions(): QuestionImport {
  const questions = getAllQuestions();
  return {
    questions: questions.map(({ id, active, ...rest }) => rest)
  };
}

export function getQuestionStats(): Record<QuestionType, number> {
  const rows = db.prepare(`
    SELECT type, COUNT(*) as count
    FROM questions
    WHERE active = 1
    GROUP BY type
  `).all() as { type: QuestionType; count: number }[];

  const stats: Record<QuestionType, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const row of rows) {
    stats[row.type] = row.count;
  }
  return stats;
}

export function getTotalQuestions(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM questions WHERE active = 1').get() as { count: number };
  return result.count;
}
