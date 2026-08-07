/**
 * Anti-repetition : sur une serie de manches, aucune question ne doit revenir
 * tant que le vivier n'est pas epuise.
 *
 * Deux angles :
 *  - une serie de 6 manches dans chacun des 9 modes ;
 *  - un vivier volontairement minuscule (les 7 questions de type L du theme
 *    « Souvenirs ») pour observer l'epuisement puis le recyclage.
 */
import Database from 'better-sqlite3';
import type { Session } from '../harness/runner.js';
import { accord, desaccord, playRound } from '../harness/client.js';
import { MODES, P, type ModeCfg } from './modes.js';

/**
 * La mort subite s'arrete des qu'un joueur perd 3 manches : meme en alternant
 * le vainqueur a chaque manche, la partie ne peut pas depasser 5 manches.
 */
function serieLength(m: ModeCfg): number {
  return m.id === 'sudden_death' ? 5 : 6;
}

function serieSession(m: ModeCfg): Session {
  const SERIE = serieLength(m);
  return {
    id: `anti-repetition/${m.id}`,
    group: `mode ${m.id}`,
    expected: 1,
    timeoutMs: 240_000,
    async run(t) {
      const party = await t.party({
        gameMode: m.id,
        questionTypes: m.questionTypes,
        categories: m.categories,
        // Le mode classique s'arrete au nombre demande : il en faut assez.
        questionCount: m.questionCount ?? undefined,
      });
      await party.accept();
      const started = await party.start();
      if (!started.success) throw new Error(`game:start refuse : ${started.error}`);

      const vus: { id: number; texte: string }[] = [];
      for (let i = 0; i < SERIE; i++) {
        // On alterne accord/desaccord (pour ne pas atteindre la serie gagnante
        // du mode complices) ET l'ordre des reponses (pour que la mort subite
        // alterne les vainqueurs et ne s'arrete pas au bout de 3 manches).
        const r = await playRound(party, {
          a1: accord,
          a2: i % 2 === 0 ? accord : desaccord,
          first: i % 2 === 0 ? 1 : 2,
        });
        vus.push({ id: r.question.id, texte: String(r.question.text).slice(0, 50) });
      }

      const uniques = new Set(vus.map((v) => v.id));
      const doublons = vus
        .filter((v, i) => vus.findIndex((x) => x.id === v.id) !== i)
        .map((v) => `#${v.id} "${v.texte}"`);
      t.ok(
        `${P(m)} aucune question ne revient sur ${SERIE} manches consecutives`,
        uniques.size === SERIE,
        `${uniques.size} questions distinctes sur ${SERIE} — repetitions : ${doublons.join(', ') || 'aucune'}`
      );
    },
  };
}

/**
 * Vivier volontairement minuscule : theme « Souvenirs » restreint au type L,
 * soit 7 questions en base. Le moteur doit toutes les servir avant d'en
 * rejouer une, puis recycler plutot que d'interrompre la partie.
 */
const epuisement: Session = {
  id: 'anti-repetition/vivier-epuise',
  group: 'transverse',
  expected: 3,
  timeoutMs: 250_000,
  async run(t) {
    // Taille reelle du vivier, mesuree en lecture seule sur la base du serveur :
    // le catalogue bouge, le test s'y adapte au lieu de figer un chiffre.
    const db = new Database(t.dbPath, { readonly: true });
    const vivier = (db.prepare(
      `SELECT COUNT(*) AS n FROM questions
       WHERE active = 1 AND category = 'souvenirs' AND type = 'L'
         AND option_a IS NOT NULL AND option_a <> '' AND option_b IS NOT NULL AND option_b <> ''`
    ).get() as { n: number }).n;
    db.close();

    if (vivier < 3 || vivier > 9) {
      throw new Error(
        `vivier « souvenirs / type L » inadapte au test : ${vivier} questions jouables ` +
        '(le test attend entre 3 et 9 ; choisir un autre couple theme/type)'
      );
    }

    const party = await t.party({
      gameMode: 'complices',
      categories: ['souvenirs'],
      questionTypes: ['L'],
    });
    await party.accept();
    const started = await party.start();
    if (!started.success) throw new Error(`game:start refuse : ${started.error}`);

    // Boucle manuelle : sur une question resservie, le serveur peut refuser les
    // reponses (voir le scenario final) et la revelation n'arrive alors qu'a
    // l'expiration du chrono. On dimensionne les attentes en consequence.
    const vus: { id: number; ack1: boolean; ack2: boolean }[] = [];
    for (let i = 0; i < vivier + 2; i++) {
      const q = await party.host.wait('game:question', { timeout: 40000, what: `manche ${i + 1}` });
      const question = q.data.question;
      // Desaccord systematique : la serie de complices ne monte pas, la
      // partie ne se termine pas avant la fin de l'observation.
      const a1 = await party.host.answer(accord(question));
      const a2 = await party.guest.answer(desaccord(question));
      await party.host.wait('game:reveal', {
        timeout: (question.timer + 12) * 1000,
        what: `revelation manche ${i + 1}`,
      });
      vus.push({ id: question.id, ack1: a1.accepted, ack2: a2.accepted });
    }

    const premier = vus.slice(0, vivier).map((v) => v.id);
    t.ok(
      `[anti-repetition] les ${vivier} questions d'un vivier restreint sortent toutes avant la moindre repetition`,
      new Set(premier).size === vivier,
      `identifiants servis : ${premier.join(', ')}`
    );

    const suite = vus.slice(vivier);
    t.ok(
      '[anti-repetition] le vivier epuise recycle les questions au lieu d\'interrompre la partie',
      suite.length === 2 && suite.every((v) => premier.includes(v.id)),
      `manches ${vivier + 1} et ${vivier + 2} : ${suite.map((v) => v.id).join(', ')} — ` +
        `vivier initial : ${premier.join(', ')}`
    );

    t.bug(
      '[anti-repetition] une question resservie apres epuisement accepte de nouvelles reponses',
      suite.every((v) => v.ack1 && v.ack2),
      'les reponses sont indexees par identifiant de question (gameService.ts:841, gameState.answers) : ' +
        'quand le vivier est epuise et qu\'une question revient, les reponses de la premiere fois sont ' +
        'toujours en memoire, les nouvelles sont refusees « Reponse deja enregistree » (gameService.ts:846) ' +
        'et la manche se revele toute seule a l\'expiration du chrono, en rejouant l\'ancien resultat',
      `acquittements des manches resservies : ${suite.map((v) => `${v.id}=${v.ack1}/${v.ack2}`).join(', ')}`
    );
  },
};

export const antiRepetitionSessions: Session[] = [...MODES.map(serieSession), epuisement];
