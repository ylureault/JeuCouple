/**
 * Anti-repetition : sur une serie de manches, aucune question ne doit revenir
 * tant que le vivier n'est pas epuise.
 *
 * Deux angles :
 *  - une serie de 6 manches dans chacun des 9 modes ;
 *  - un vivier volontairement minuscule (les 7 questions de type L du theme
 *    « Souvenirs ») pour observer l'epuisement puis le recyclage.
 */
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
  expected: 2,
  timeoutMs: 240_000,
  async run(t) {
    const party = await t.party({
      gameMode: 'complices',
      categories: ['souvenirs'],
      questionTypes: ['L'],
    });
    await party.accept();
    const started = await party.start();
    if (!started.success) throw new Error(`game:start refuse : ${started.error}`);

    const vus: number[] = [];
    for (let i = 0; i < 9; i++) {
      // Desaccord systematique : la serie de complices ne monte pas, la
      // partie ne se termine pas avant la fin de l'observation.
      const r = await playRound(party, { a1: accord, a2: desaccord });
      vus.push(r.question.id);
    }

    const sept = vus.slice(0, 7);
    t.ok(
      '[anti-repetition] les 7 questions d\'un vivier restreint sortent toutes avant la moindre repetition',
      new Set(sept).size === 7,
      `identifiants servis : ${sept.join(', ')}`
    );

    const suite = vus.slice(7);
    t.ok(
      '[anti-repetition] le vivier epuise recycle les questions au lieu d\'interrompre la partie',
      suite.length === 2 && suite.every((id) => sept.includes(id)),
      `manches 8 et 9 : ${suite.join(', ')} — vivier initial : ${sept.join(', ')}`
    );
  },
};

export const antiRepetitionSessions: Session[] = [...MODES.map(serieSession), epuisement];
