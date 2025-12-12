import { db } from '../database.js';
import crypto from 'crypto';

interface Admin {
  id: number;
  email: string;
  password_hash: string;
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function createAdmin(email: string, password: string): void {
  const hash = hashPassword(password);
  db.prepare(`
    INSERT OR REPLACE INTO admin (id, email, password_hash)
    VALUES (1, ?, ?)
  `).run(email, hash);
}

export function verifyAdmin(email: string, password: string): boolean {
  const admin = db.prepare('SELECT * FROM admin WHERE email = ?').get(email) as Admin | undefined;
  if (!admin) return false;

  const hash = hashPassword(password);
  return admin.password_hash === hash;
}

export function getAdmin(): Admin | undefined {
  return db.prepare('SELECT * FROM admin WHERE id = 1').get() as Admin | undefined;
}

export function initializeAdminIfNeeded(): void {
  const admin = getAdmin();
  if (!admin) {
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    createAdmin(email, password);
    console.log('Admin account created');
  }
}
