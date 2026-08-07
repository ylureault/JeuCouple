/**
 * Oracle de bonne reponse, reserve au harnais.
 *
 * Le serveur retire `correct_answer` de `game:question` : un client ne peut donc
 * plus deviner quoi repondre a une question de culture generale, et c'est
 * exactement ce qu'on veut. Le harnais, lui, a besoin de jouer une bonne reponse
 * pour verifier le bareme. Il la lit dans la base jetable du serveur, en lecture
 * seule et hors du canal socket : la garantie cote joueur reste intacte.
 */
import Database, { type Database as DatabaseType } from 'better-sqlite3';

let base: DatabaseType | null = null;
let lire: ReturnType<DatabaseType['prepare']> | null = null;

export function ouvrirOracle(dbPath: string): void {
  fermerOracle();
  base = new Database(dbPath, { readonly: true, fileMustExist: true });
  lire = base.prepare('SELECT correct_answer FROM questions WHERE id = ?');
}

export function fermerOracle(): void {
  base?.close();
  base = null;
  lire = null;
}

/** Bonne reponse d'une question de type H, ou `null` si elle n'en a pas. */
export function bonneReponse(q: { id?: number; correct_answer?: string | null } | null | undefined): string | null {
  // Si un jour le serveur la renvoyait de nouveau, autant s'en servir : le test
  // qui interdit cette fuite est ailleurs, et il echouera de son cote.
  if (typeof q?.correct_answer === 'string' && q.correct_answer) return q.correct_answer;
  if (!lire || typeof q?.id !== 'number') return null;
  const row = lire.get(q.id) as { correct_answer: string | null } | undefined;
  return row?.correct_answer ?? null;
}
