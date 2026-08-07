import { db } from '../database.js';
import crypto from 'crypto';

interface Admin {
  id: number;
  email: string;
  password_hash: string;
}

const SCRYPT_KEYLEN = 64;

// Format stocke : "scrypt:<sel hex>:<hash hex>".
// L'ancien format etait un SHA-256 sans sel : cassable par table arc-en-ciel
// en cas de fuite de la base (constat de l'audit securite).
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith('scrypt:')) {
    const [, salt, hex] = stored.split(':');
    if (!salt || !hex) return false;
    const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hex, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }
  // Heritage : comptes existants en SHA-256 sans sel. On accepte pour ne pas
  // verrouiller l'admin dehors ; verifyAdmin migre vers scrypt juste apres.
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  const a = Buffer.from(legacy);
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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

  const ok = verifyPassword(password, admin.password_hash);
  // Migration transparente : au premier login reussi d'un compte heritage,
  // le mot de passe est re-hache en scrypt sale.
  if (ok && !admin.password_hash.startsWith('scrypt:')) {
    db.prepare('UPDATE admin SET password_hash = ? WHERE id = ?')
      .run(hashPassword(password), admin.id);
  }
  return ok;
}

export function getAdmin(): Admin | undefined {
  return db.prepare('SELECT * FROM admin WHERE id = 1').get() as Admin | undefined;
}

export function initializeAdminIfNeeded(): void {
  const admin = getAdmin();
  if (admin) return;

  const email = process.env.ADMIN_EMAIL || 'admin@local';
  // Plus de "admin123" par defaut, connu de quiconque lit le depot : sans
  // ADMIN_PASSWORD, on genere un mot de passe aleatoire affiche une seule fois.
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  createAdmin(email, password);
  if (generated) {
    console.log(`Compte admin cree — email : ${email} — mot de passe (affiche une seule fois, notez-le) : ${password}`);
  } else {
    console.log('Admin account created');
  }
}
