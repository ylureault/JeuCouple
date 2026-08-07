import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
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

/**
 * Menage des bases jetables.
 *
 * On NE supprime PAS la base courante dans un `afterAll` : ceux de ce fichier
 * s'executent avant ceux des suites, et effacer la base pendant qu'un serveur
 * socket ferme encore ses connexions declenchait un « attempt to write a
 * readonly database » dans les gestionnaires de deconnexion.
 * On nettoie donc les bases des executions PRECEDENTES au chargement, ce qui
 * garantit qu'aucun fichier ne s'accumule sans jamais toucher a une base vivante.
 */
function purgerAnciennesBases() {
  const marqueurProcessus = `db-${process.pid}-`;
  for (const fichier of readdirSync(tmpRoot)) {
    if (!fichier.startsWith('db-')) continue;
    if (fichier.startsWith(marqueurProcessus)) continue;
    const chemin = path.join(tmpRoot, fichier);
    try {
      if (Date.now() - statSync(chemin).mtimeMs < 60_000) continue;
      rmSync(chemin, { force: true });
    } catch {
      /* une base encore ouverte par une autre execution : on la laisse */
    }
  }
}
purgerAnciennesBases();

process.once('exit', () => {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      rmSync(testDbPath + suffix, { force: true });
    } catch {
      /* la base jetable disparait avec /tmp de toute facon */
    }
  }
});

afterAll(() => {
  if (testDb) {
    testDb.close();
  }
});
