/**
 * Deroule nominal + cadence, pour chacun des 9 modes.
 *
 * On joue deux vraies manches : la premiere prouve que la partie demarre, que
 * les deux joueurs recoivent la meme question, que les reponses sont prises en
 * compte et scorees au bareme ; la seconde sert a MESURER le delai reel entre
 * la revelation et la question suivante.
 */
import type { Session } from '../harness/runner.js';
import { accord, baremeAccord, playRound } from '../harness/client.js';
import { MODES, P, type ModeCfg } from './modes.js';

function session(m: ModeCfg): Session {
  return {
    id: `nominal/${m.id}`,
    group: `mode ${m.id}`,
    expected: 8,
    timeoutMs: 180_000,
    async run(t) {
      const party = await t.party({
        gameMode: m.id,
        questionTypes: m.questionTypes,
        categories: m.categories,
        questionCount: m.questionCount,
      });

      // 1. Le recap des reglages annonce le mode aux DEUX joueurs.
      const sHost = await party.host.wait('room:settings', { timeout: 8000 });
      const sGuest = await party.guest.wait('room:settings', { timeout: 8000 });
      t.ok(
        `${P(m)} le salon annonce le mode « ${m.label} » a ses deux joueurs`,
        sHost.data.gameMode === m.id && sGuest.data.gameMode === m.id && sGuest.data.modeLabel === m.label,
        `hote=${sHost.data.gameMode}, invite=${sGuest.data.gameMode}, libelle="${sGuest.data.modeLabel}" (attendu "${m.label}")`
      );

      // 2. Sans l'accord explicite du joueur 2, la partie ne part pas.
      const refuse = await party.start();
      t.ok(
        `${P(m)} le lancement est refuse tant que le joueur 2 n'a pas accepte les reglages`,
        refuse.success === false && /accepte/i.test(refuse.error ?? ''),
        `reponse du serveur : ${JSON.stringify(refuse)}`
      );

      await party.accept();
      const started = await party.start();
      const startedEvt = await party.guest.wait('game:started', { timeout: 8000 });

      // 3. La partie demarre et la meme question part vers les deux joueurs.
      const r1 = await playRound(party, { a1: accord, a2: accord });
      t.ok(
        `${P(m)} la partie demarre et les deux joueurs recoivent la meme premiere question`,
        started.success === true &&
          startedEvt.data.gameMode === m.id &&
          typeof r1.question?.text === 'string' && r1.question.text.length > 0 &&
          r1.question.id === r1.questionGuest?.id,
        `start=${JSON.stringify(started)}, mode annonce=${startedEvt.data.gameMode}, ` +
          `question hote=${r1.question?.id}/${r1.question?.type}, invite=${r1.questionGuest?.id}`
      );

      // 4. Les deux reponses sont acquittees et declenchent la revelation.
      t.ok(
        `${P(m)} les deux reponses sont acquittees et declenchent la revelation`,
        r1.ack1?.accepted === true && r1.ack2?.accepted === true &&
          r1.reveal.questionId === r1.question.id,
        `ack1=${JSON.stringify(r1.ack1)}, ack2=${JSON.stringify(r1.ack2)}, ` +
          `revelation sur la question ${r1.reveal.questionId} (attendu ${r1.question.id})`
      );

      // 5. Bareme : accord = 100 points de base (50 pour une reponse libre).
      const attendu = baremeAccord(r1.question.type);
      t.ok(
        `${P(m)} l'accord des deux joueurs est score au bareme attendu`,
        r1.reveal.correct === true && r1.reveal.basePoints === attendu,
        `type ${r1.question.type} : basePoints=${r1.reveal.basePoints} (attendu ${attendu}), correct=${r1.reveal.correct}`
      );

      // 6. Le score cumule correspond exactement aux points annonces.
      t.ok(
        `${P(m)} le score cumule correspond aux points de la manche`,
        r1.score.score1 === r1.reveal.points1 && r1.score.score2 === r1.reveal.points2,
        `score=${r1.score.score1}/${r1.score.score2}, points annonces=${r1.reveal.points1}/${r1.reveal.points2}`
      );

      // 7. La revelation annonce le delai avant la suite.
      t.ok(
        `${P(m)} la revelation annonce un delai de ${m.revealSeconds} s avant la suite`,
        r1.reveal.nextInSeconds === m.revealSeconds,
        `nextInSeconds=${r1.reveal.nextInSeconds} pour une question de type ${r1.question.type}`
      );

      // 8. ... et ce delai est reellement tenu (mesure au chronometre).
      const q2 = await party.host.wait('game:question', { timeout: 45000, what: 'deuxieme question' });
      const mesure = (q2.t - r1.tReveal) / 1000;
      const tolerance = m.revealSeconds >= 14 ? 1.8 : 1.3;
      t.ok(
        `${P(m)} le delai mesure avant la manche suivante vaut ${m.revealSeconds} s`,
        Math.abs(mesure - m.revealSeconds) <= tolerance,
        `mesure : ${mesure.toFixed(2)} s (attendu ${m.revealSeconds} s +/- ${tolerance} s)`
      );
    },
  };
}

export const nominalSessions: Session[] = MODES.map(session);
