import { db } from '../database.js';
import type { Category } from '../types.js';

interface CategoryRow {
  id: number;
  code: string;
  name: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  active: number;
  sort_order: number;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    icon: row.icon || '',
    color: row.color || '#666666',
    description: row.description || '',
    active: Boolean(row.active),
    sort_order: row.sort_order
  };
}

export function getAllCategories(): Category[] {
  const rows = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all() as CategoryRow[];
  return rows.map(rowToCategory);
}

export function getActiveCategories(): Category[] {
  const rows = db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort_order, name').all() as CategoryRow[];
  return rows.map(rowToCategory);
}

export function getCategoryByCode(code: string): Category | undefined {
  const row = db.prepare('SELECT * FROM categories WHERE code = ?').get(code) as CategoryRow | undefined;
  return row ? rowToCategory(row) : undefined;
}

export function getCategoryById(id: number): Category | undefined {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as CategoryRow | undefined;
  return row ? rowToCategory(row) : undefined;
}

export function createCategory(data: Omit<Category, 'id' | 'active'>): Category {
  const result = db.prepare(`
    INSERT INTO categories (code, name, icon, color, description, sort_order, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(
    data.code,
    data.name,
    data.icon,
    data.color,
    data.description,
    data.sort_order
  );

  return getCategoryById(result.lastInsertRowid as number)!;
}

export function updateCategory(id: number, data: Partial<Omit<Category, 'id'>>): Category | null {
  const existing = getCategoryById(id);
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
  if (data.icon !== undefined) {
    updates.push('icon = ?');
    values.push(data.icon);
  }
  if (data.color !== undefined) {
    updates.push('color = ?');
    values.push(data.color);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    values.push(data.description);
  }
  if (data.sort_order !== undefined) {
    updates.push('sort_order = ?');
    values.push(data.sort_order);
  }
  if (data.active !== undefined) {
    updates.push('active = ?');
    values.push(data.active ? 1 : 0);
  }

  if (updates.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  return getCategoryById(id)!;
}

export function deleteCategory(id: number): boolean {
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getCategoryStats(): Record<string, number> {
  const rows = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM questions
    WHERE active = 1
    GROUP BY category
  `).all() as { category: string; count: number }[];

  const stats: Record<string, number> = {};
  for (const row of rows) {
    stats[row.category] = row.count;
  }
  return stats;
}
