/**
 * Point d'entree unique de la suite GAMEPLAY.
 *
 *   npm run test:gameplay                 -> toute la suite
 *   npm run test:gameplay -- --filter=duel  -> une partie seulement
 *   npm run test:gameplay -- --concurrency=8
 *
 * Aucun mock : un vrai serveur est lance sur une base SQLite jetable et un port
 * libre, et chaque scenario joue de vraies manches avec deux vrais clients
 * socket.io. Les sessions tournent en parallele (un salon chacune, une adresse
 * source dediee) pour absorber la cadence reelle du jeu.
 */
import { startGameServer } from './harness/server.js';
import { runAll, type Session } from './harness/runner.js';
import { nominalSessions } from './suites/nominal.js';
import { limitesSessions } from './suites/limites.js';
import { antiRepetitionSessions } from './suites/antirepetition.js';
import { reglesSessions } from './suites/regles.js';
import { typesSessions } from './suites/types.js';
import { transverseSessions } from './suites/transverse.js';

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const sessions: Session[] = [
  ...nominalSessions,
  ...reglesSessions,
  ...limitesSessions,
  ...antiRepetitionSessions,
  ...typesSessions,
  ...transverseSessions,
];

const concurrency = Number(arg('concurrency', '14'));
const filter = arg('filter', '');

// Paliers d'escalade d'une manche et duel du mix toutes les 3 manches : ces
// deux reglages existent deja en production (ESCALADE_PALIER_LEN, MIX_DUEL_PERIOD)
// et permettent d'atteindre les cas rares sans jouer 30 manches.
const ESCALADE_PALIER_LEN = 1;
const MIX_DUEL_PERIOD = 3;

console.error('Demarrage du serveur de jeu (base jetable, port dedie)...');
const server = await startGameServer({
  escaladePalierLen: ESCALADE_PALIER_LEN,
  mixDuelPeriod: MIX_DUEL_PERIOD,
});
console.error(`Serveur pret sur ${server.url} — journal : ${server.logPath}`);
console.error(
  `${filter ? 'Sessions filtrees' : 'Sessions'} : ${sessions.length}, ` +
  `${concurrency} en parallele, ESCALADE_PALIER_LEN=${ESCALADE_PALIER_LEN}, MIX_DUEL_PERIOD=${MIX_DUEL_PERIOD}\n`
);

const debut = Date.now();
let code = 1;
try {
  code = await runAll(sessions, {
    url: server.url,
    dbPath: server.dbPath,
    concurrency,
    escaladePalierLen: ESCALADE_PALIER_LEN,
    mixDuelPeriod: MIX_DUEL_PERIOD,
    filter: filter || undefined,
  });
} finally {
  console.log(`Duree totale : ${((Date.now() - debut) / 1000).toFixed(0)} s`);
  await server.stop();
}

process.exit(code);
