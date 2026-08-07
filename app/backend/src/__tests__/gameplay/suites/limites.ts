/**
 * Cas limites de la saisie, pour chacun des 9 modes.
 *
 * Une reponse envoyee au mauvais moment doit etre REFUSEE avec un message, pas
 * absorbee en silence ; « passer » ne doit rien couter ; le joker coute 50.
 */
import type { Session } from '../harness/runner.js';
import { accord, playRound } from '../harness/client.js';
import { MODES, P, type ModeCfg } from './modes.js';

function session(m: ModeCfg): Session {
  return {
    id: `limites/${m.id}`,
    group: `mode ${m.id}`,
    expected: 5,
    timeoutMs: 200_000,
    async run(t) {
      const party = await t.party({
        gameMode: m.id,
        questionTypes: m.questionTypes,
        categories: m.categories,
        questionCount: m.questionCount,
      });
      await party.accept();
      const started = await party.start();
      if (!started.success) throw new Error(`game:start refuse : ${started.error}`);

      // 1. La partie existe mais la question n'est pas encore partie (800 ms
      //    de montage cote client) : toute reponse doit etre refusee.
      const avant = await party.host.answer('A');
      t.ok(
        `${P(m)} une reponse envoyee avant la question est refusee`,
        avant.accepted === false && typeof avant.error === 'string' && avant.error.length > 0,
        `reponse du serveur : ${JSON.stringify(avant)}`
      );

      // Manche 1 : double reponse puis reponse hors delai.
      const q1 = await party.host.wait('game:question', { timeout: 30000, what: 'premiere question' });
      const question1 = q1.data.question;
      const bonne = accord(question1);
      const premier = await party.host.answer(bonne);
      const doublon = await party.host.answer(bonne);
      t.ok(
        `${P(m)} la double reponse d'un meme joueur est refusee`,
        premier.accepted === true && doublon.accepted === false && /deja/i.test(doublon.error ?? ''),
        `1re=${JSON.stringify(premier)}, 2e=${JSON.stringify(doublon)}`
      );

      await party.guest.answer(bonne);
      await party.host.wait('game:reveal', { timeout: 15000, what: 'revelation manche 1' });
      const tard = await party.host.answer(bonne);
      t.ok(
        `${P(m)} une reponse hors delai (apres la revelation) est refusee`,
        tard.accepted === false && typeof tard.error === 'string' && tard.error.length > 0,
        `reponse du serveur : ${JSON.stringify(tard)}`
      );

      // Manche 2 : « passer » — poser une limite ne doit rien couter.
      const r2 = await playRound(party, { a1: 'passer', a2: accord });
      t.ok(
        `${P(m)} « passer » ne retire aucun point`,
        r2.reveal.points1 >= 0,
        `points du joueur qui passe : ${r2.reveal.points1} (type ${r2.question.type})`
      );

      // Manche 3 : joker — esquive payante, 50 points de penalite.
      const r3 = await playRound(party, { a1: 'joker', a2: accord });
      t.ok(
        `${P(m)} le joker coute 50 points`,
        r3.reveal.points1 === -50,
        `points du joueur qui joke : ${r3.reveal.points1} (attendu -50, type ${r3.question.type})`
      );
    },
  };
}

export const limitesSessions: Session[] = MODES.map(session);
