/**
 * Couverture par TYPE de question : chaque type doit accepter la reponse que
 * l'interface envoie reellement, et la scorer au bareme annonce.
 *
 * Les valeurs utilisees sont exactement celles emises par
 * app/frontend/src/components/QuestionCard.tsx ('A'/'B', 'vrai'/'faux',
 * 'player1', 'plus'/'moins', 'daccord'/'pasdaccord', note 1-10, texte libre).
 */
import type { Session } from '../harness/runner.js';
import { accord, baremeAccord, playRound } from '../harness/client.js';

interface TypeCfg {
  code: string;
  libelle: string;
}

const TYPES: TypeCfg[] = [
  { code: 'A', libelle: 'QCM' },
  { code: 'B', libelle: 'QCM couple' },
  { code: 'C', libelle: 'reponse libre' },
  { code: 'D', libelle: 'echelle 1-10' },
  { code: 'E', libelle: 'choix binaire' },
  { code: 'F', libelle: 'qui de nous deux' },
  { code: 'G', libelle: 'vrai ou faux' },
  { code: 'H', libelle: 'culture, bonne reponse' },
  { code: 'I', libelle: 'choix illustre' },
  { code: 'L', libelle: 'avant / apres' },
  { code: 'N', libelle: 'plus / moins' },
  { code: 'S', libelle: 'hot take' },
];

function session(tc: TypeCfg): Session {
  return {
    id: `types/${tc.code}`,
    group: 'types de questions',
    expected: 2,
    timeoutMs: 120_000,
    async run(t) {
      const party = await t.party({
        gameMode: 'classic',
        questionTypes: [tc.code],
        questionCount: 5,
      });
      await party.accept();
      const started = await party.start();
      if (!started.success) throw new Error(`game:start refuse : ${started.error}`);

      const r = await playRound(party, { a1: accord, a2: accord });

      t.ok(
        `[type ${tc.code} — ${tc.libelle}] la reponse attendue par le serveur est acceptee`,
        r.question.type === tc.code && r.ack1?.accepted === true && r.ack2?.accepted === true,
        `type servi=${r.question.type}, reponse envoyee="${accord(r.question)}", ` +
          `ack=${JSON.stringify(r.ack1)}/${JSON.stringify(r.ack2)}`
      );

      const attendu = baremeAccord(tc.code);
      t.ok(
        `[type ${tc.code} — ${tc.libelle}] l'accord des deux joueurs vaut ${attendu} points de base`,
        r.reveal.correct === true &&
          r.reveal.basePoints === attendu &&
          r.reveal.points1 >= attendu && r.reveal.points2 >= attendu,
        `correct=${r.reveal.correct}, basePoints=${r.reveal.basePoints} (attendu ${attendu}), ` +
          `points=${r.reveal.points1}/${r.reveal.points2}`
      );
    },
  };
}

export const typesSessions: Session[] = TYPES.map(session);
