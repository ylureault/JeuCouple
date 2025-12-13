import { db } from '../database.js';
import type { QuestionTypeConfig, ScoringMode, InputType } from '../../../shared/types.js';

interface QuestionTypeRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  scoring_mode: ScoringMode;
  input_type: InputType;
  icon: string | null;
  color: string | null;
  active: number;
  created_at: string;
}

function rowToQuestionType(row: QuestionTypeRow): QuestionTypeConfig {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || '',
    scoring_mode: row.scoring_mode,
    input_type: row.input_type,
    icon: row.icon || '',
    color: row.color || '#666666',
    active: Boolean(row.active)
  };
}

export function getAllQuestionTypes(): QuestionTypeConfig[] {
  const rows = db.prepare('SELECT * FROM question_types ORDER BY code').all() as QuestionTypeRow[];
  return rows.map(rowToQuestionType);
}

export function getActiveQuestionTypes(): QuestionTypeConfig[] {
  const rows = db.prepare('SELECT * FROM question_types WHERE active = 1 ORDER BY code').all() as QuestionTypeRow[];
  return rows.map(rowToQuestionType);
}

export function getQuestionTypeByCode(code: string): QuestionTypeConfig | undefined {
  const row = db.prepare('SELECT * FROM question_types WHERE code = ?').get(code) as QuestionTypeRow | undefined;
  return row ? rowToQuestionType(row) : undefined;
}

export function getQuestionTypeById(id: number): QuestionTypeConfig | undefined {
  const row = db.prepare('SELECT * FROM question_types WHERE id = ?').get(id) as QuestionTypeRow | undefined;
  return row ? rowToQuestionType(row) : undefined;
}

export function createQuestionType(data: Omit<QuestionTypeConfig, 'id' | 'active'>): QuestionTypeConfig {
  const result = db.prepare(`
    INSERT INTO question_types (code, name, description, scoring_mode, input_type, icon, color, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    data.code,
    data.name,
    data.description,
    data.scoring_mode,
    data.input_type,
    data.icon,
    data.color
  );

  return getQuestionTypeById(result.lastInsertRowid as number)!;
}

export function updateQuestionType(id: number, data: Partial<Omit<QuestionTypeConfig, 'id'>>): QuestionTypeConfig | null {
  const existing = getQuestionTypeById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (data.code !== undefined) {
    updates.push('code = ?');
    values.push(data.code);
  }
  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.scoring_mode !== undefined) {
    updates.push('scoring_mode = ?');
    values.push(data.scoring_mode);
  }
  if (data.input_type !== undefined) {
    updates.push('input_type = ?');
    values.push(data.input_type);
  }
  if (data.icon !== undefined) {
    updates.push('icon = ?');
    values.push(data.icon);
  }
  if (data.color !== undefined) {
    updates.push('color = ?');
    values.push(data.color);
  }
  if (data.active !== undefined) {
    updates.push('active = ?');
    values.push(data.active ? 1 : 0);
  }

  if (updates.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE question_types SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  return getQuestionTypeById(id)!;
}

export function deleteQuestionType(id: number): boolean {
  const result = db.prepare('DELETE FROM question_types WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getScoringModeForType(typeCode: string): ScoringMode {
  const type = getQuestionTypeByCode(typeCode);
  return type?.scoring_mode || 'match';
}

export function getInputTypeForType(typeCode: string): InputType {
  const type = getQuestionTypeByCode(typeCode);
  return type?.input_type || 'options';
}
