import { db } from '../database.js';
import type { Question, QuestionType, QuestionImport } from '../types.js';

interface QuestionRow {
  id: number;
  type: QuestionType;
  category: string;
  text: string;
  options: string | null;
  option_a: string | null;
  option_b: string | null;
  emoji_a: string | null;
  emoji_b: string | null;
  target_player: number | null;
  correct_answer: string | null;
  timer: number;
  active: number;
}

function rowToQuestion(row: QuestionRow): Question {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    text: row.text,
    options: row.options ? JSON.parse(row.options) : undefined,
    option_a: row.option_a || undefined,
    option_b: row.option_b || undefined,
    // Sans ces deux lignes, les questions "choix visuel" (type I) arrivaient
    // au client sans emoji : l'ecran affichait le texte et AUCUN bouton.
    emoji_a: row.emoji_a || undefined,
    emoji_b: row.emoji_b || undefined,
    target_player: row.target_player as (1 | 2) || undefined,
    correct_answer: row.correct_answer || undefined,
    timer: row.timer,
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

/**
 * Get questions with a balanced mix of different question types.
 * Ensures variety by selecting proportionally from each type.
 * @param count Number of questions to fetch
 * @param categories Optional array of categories to filter by (empty = all categories)
 * @param questionTypes Optional array of question types to filter by (empty = all types)
 */
/**
 * Une question est jouable si elle porte de quoi repondre pour SON type.
 * Recette utilisateur : des manches entieres affichaient le texte et zero
 * bouton. On ne sert plus jamais une question injouable — on en tire une autre.
 */
export function isPlayable(q: Question): boolean {
  const opts = Array.isArray(q.options) ? q.options : [];
  switch (q.type) {
    case 'A': case 'B': case 'M': case 'O': case 'P': case 'R':
      return opts.length >= 2;
    case 'H':
      return opts.length >= 2 && !!q.correct_answer && opts.includes(q.correct_answer);
    case 'E': case 'L':
      return !!q.option_a && !!q.option_b;
    case 'I':
      return !!q.option_a && !!q.option_b && !!q.emoji_a && !!q.emoji_b;
    case 'N':
      // Plus/Moins : sans nombre de reference, la question n'a pas de sens.
      return typeof q.reference_value === 'number';
    // C (texte), D/Q/K (echelle), F (qui de nous), G (vrai/faux), S (accord)
    // n'ont besoin d'aucun champ supplementaire : l'interface est fixe.
    default:
      return true;
  }
}

export function getMixedQuestions(count: number, categories: string[] = [], questionTypes: string[] = [], excludeIds: number[] = []): Question[] {
  // Build filters
  const hasCategories = categories.length > 0;
  const hasTypes = questionTypes.length > 0;

  // Build WHERE conditions
  const conditions: string[] = ['active = 1'];
  const params: (string | number)[] = [];

  if (hasCategories) {
    conditions.push(`category IN (${categories.map(() => '?').join(',')})`);
    params.push(...categories);
  }

  if (hasTypes) {
    conditions.push(`type IN (${questionTypes.map(() => '?').join(',')})`);
    params.push(...questionTypes);
  }

  // Questions deja servies dans la partie : sans cette exclusion, chaque
  // tirage des modes sans fin etait independant et les petites categories
  // (petits noms...) rejouaient les memes questions en trois manches.
  // Cap a 500 : limite de parametres SQLite, et au-dela le cycle est sain.
  const exclude = excludeIds.slice(-500);
  if (exclude.length > 0) {
    conditions.push(`id NOT IN (${exclude.map(() => '?').join(',')})`);
    params.push(...exclude);
  }

  const whereClause = conditions.join(' AND ');

  // Get available question types and their counts
  const statsQuery = `SELECT type, COUNT(*) as count FROM questions WHERE ${whereClause} GROUP BY type`;
  const statsRows = db.prepare(statsQuery).all(...params) as { type: QuestionType; count: number }[];

  const availableTypes = statsRows
    .filter(row => row.count > 0)
    .map(row => row.type);

  if (availableTypes.length === 0) {
    return [];
  }

  // Calculate how many questions per type (at least 1 from each if possible)
  const questionsPerType = Math.max(1, Math.floor(count / availableTypes.length));
  const remainder = count - (questionsPerType * availableTypes.length);

  const selectedQuestions: Question[] = [];
  const usedIds = new Set<number>();

  // Select questions from each type
  for (let i = 0; i < availableTypes.length; i++) {
    const type = availableTypes[i];
    // Add extra question to first few types to use the remainder
    const typeCount = questionsPerType + (i < remainder ? 1 : 0);

    // Build query for this type
    const typeConditions = [...conditions, 'type = ?'];
    const typeParams = [...params, type, typeCount];

    const typeQuery = `SELECT * FROM questions WHERE ${typeConditions.join(' AND ')} ORDER BY RANDOM() LIMIT ?`;
    const typeQuestions = db.prepare(typeQuery).all(...typeParams) as QuestionRow[];

    for (const row of typeQuestions) {
      if (!usedIds.has(row.id)) {
        usedIds.add(row.id);
        selectedQuestions.push(rowToQuestion(row));
      }
    }
  }

  // If we don't have enough questions, fill with random ones from the same filters
  if (selectedQuestions.length < count) {
    const needed = count - selectedQuestions.length;
    const excludeIds = Array.from(usedIds);

    let query = `SELECT * FROM questions WHERE ${whereClause}`;

    if (excludeIds.length > 0) {
      query += ` AND id NOT IN (${excludeIds.join(',')})`;
    }

    query += ` ORDER BY RANDOM() LIMIT ?`;

    const additionalRows = db.prepare(query).all(...params, needed) as QuestionRow[];

    for (const row of additionalRows) {
      selectedQuestions.push(rowToQuestion(row));
    }
  }

  // Shuffle the final array for randomness
  for (let i = selectedQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selectedQuestions[i], selectedQuestions[j]] = [selectedQuestions[j], selectedQuestions[i]];
  }

  // Filet final : aucune question injouable ne sort d'ici.
  return selectedQuestions.filter(isPlayable).slice(0, count);
}

export function createQuestion(question: Omit<Question, 'id' | 'active'>): Question {
  const result = db.prepare(`
    INSERT INTO questions (type, category, text, options, option_a, option_b, timer, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    question.type,
    question.category,
    question.text,
    question.options ? JSON.stringify(question.options) : null,
    question.option_a || null,
    question.option_b || null,
    question.timer || 20
  );

  return getQuestionById(result.lastInsertRowid as number)!;
}

/**
 * Enregistre une question fabriquee a la volee (mode "A l'envers").
 *
 * Elle doit exister en base : answers.question_id porte une cle etrangere vers
 * questions(id) et les cles etrangeres sont actives, donc un identifiant
 * synthetique ferait echouer l'enregistrement de chaque reponse.
 * Elle est inserte inactive pour ne jamais ressortir dans un tirage normal.
 */
export function createSyntheticQuestion(question: Omit<Question, 'id' | 'active'>): Question {
  const result = db.prepare(`
    INSERT INTO questions (type, category, text, options, correct_answer, timer, active)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(
    question.type,
    question.category,
    question.text,
    question.options ? JSON.stringify(question.options) : null,
    question.correct_answer ?? null,
    question.timer || 30
  );

  const created = getQuestionById(result.lastInsertRowid as number)!;
  // getQuestionById renvoie active=false ; le moteur doit pouvoir la jouer.
  return { ...created, active: true };
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
  if (question.option_a !== undefined) {
    updates.push('option_a = ?');
    values.push(question.option_a);
  }
  if (question.option_b !== undefined) {
    updates.push('option_b = ?');
    values.push(question.option_b);
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
    INSERT INTO questions (type, category, text, options, option_a, option_b, timer, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  let imported = 0;
  const transaction = db.transaction(() => {
    for (const q of data.questions) {
      insert.run(
        q.type,
        q.category,
        q.text,
        q.options ? JSON.stringify(q.options) : null,
        q.option_a || null,
        q.option_b || null,
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

  const stats: Record<QuestionType, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0, O: 0, P: 0, Q: 0, R: 0, S: 0 };
  for (const row of rows) {
    stats[row.type] = row.count;
  }
  return stats;
}

export function getTotalQuestions(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM questions WHERE active = 1').get() as { count: number };
  return result.count;
}
