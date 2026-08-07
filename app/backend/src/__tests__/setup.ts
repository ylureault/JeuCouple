import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

/**
 * Chaque fichier de test recoit sa PROPRE base SQLite jetable.
 *
 * Jest recharge les modules pour chaque fichier de test : `src/database.ts`
 * ouvre donc une base neuve, choisie par DATABASE_PATH. Cette variable doit
 * etre posee AVANT que le fichier de test (et ses imports) ne soit evalue —
 * c'est exactement ce que garantit `setupFilesAfterEnv`.
 */
const tmpRoot = path.join(os.tmpdir(), 'jeucouple-tests');
if (!existsSync(tmpRoot)) mkdirSync(tmpRoot, { recursive: true });

export const testDbPath = path.join(
  tmpRoot,
  `db-${process.pid}-${crypto.randomBytes(8).toString('hex')}.sqlite`
);

process.env.DATABASE_PATH = testDbPath;
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.JWT_SECRET = 'test-secret-key-for-testing';

// Conserve pour les suites historiques qui ouvrent leur propre base memoire.
export let testDb: Database.Database;

afterAll(async () => {
  if (testDb) {
    testDb.close();
  }
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      rmSync(testDbPath + suffix, { force: true });
    } catch {
      /* la base jetable disparait avec /tmp de toute facon */
    }
  }
});
