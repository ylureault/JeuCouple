import { existsSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

/**
 * Efface les bases SQLite jetables une fois TOUTES les suites terminees.
 *
 * Le faire dans un `afterAll` ne conviendrait pas : ceux du fichier de setup
 * s'executent avant ceux des suites, et supprimer la base pendant qu'un serveur
 * socket ferme encore ses connexions declenche un « attempt to write a readonly
 * database » dans les gestionnaires de deconnexion.
 */
export default function globalTeardown(): void {
  const dossier = path.join(os.tmpdir(), 'jeucouple-tests');
  if (!existsSync(dossier)) return;
  try {
    rmSync(dossier, { recursive: true, force: true });
  } catch {
    /* /tmp fera le menage de toute facon */
  }
}
