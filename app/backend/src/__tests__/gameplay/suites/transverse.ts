/**
 * Scenarios transverses : changement de jeu en cours de partie, pause manuelle,
 * deconnexion / reconnexion en pleine manche.
 */
import type { Session } from '../harness/runner.js';
import { Peer, accord, playRound } from '../harness/client.js';

// ─────────────────────────────────────────── changement de mode en partie ───
const changementDeMode: Session = {
  id: 'transverse/changement-de-mode',
  group: 'transverse',
  expected: 7,
  timeoutMs: 180_000,
  async run(t) {
    const party = await t.party({ gameMode: 'classic', questionTypes: ['E'], questionCount: 10 });
    await party.accept();
    await party.start();
    await playRound(party, { a1: accord, a2: accord });

    // Un mode qui n'existe pas dans le registre : rien ne doit partir.
    party.host.emit('mode:propose', { mode: 'partie-de-belote' });
    t.ok(
      '[changement de mode] un mode inconnu est ignore',
      await party.guest.silence('mode:proposal', 1500),
      'le serveur a relaye une proposition pour un mode absent du registre'
    );

    // Le mode deja actif : proposition sans objet.
    party.host.emit('mode:propose', { mode: 'classic' });
    t.ok(
      '[changement de mode] proposer le mode deja actif est ignore',
      await party.guest.silence('mode:proposal', 1500),
      'le serveur a relaye une proposition vers le mode deja en cours'
    );

    // Proposition legitime.
    party.host.emit('mode:propose', { mode: 'duel' });
    const prop = await party.guest.wait('mode:proposal', { timeout: 6000, what: 'proposition de changement' });
    t.ok(
      '[changement de mode] la proposition est transmise au partenaire',
      prop.data.mode === 'duel' && prop.data.fromPlayerId === 1 &&
        prop.data.timeoutSeconds > 0 && typeof prop.data.label === 'string',
      `proposition recue : ${JSON.stringify(prop.data)}`
    );

    // Le proposant tente de valider sa propre demande.
    party.host.emit('mode:respond', { accept: true });
    t.ok(
      '[changement de mode] le proposant ne peut pas valider sa propre proposition',
      await party.host.silence('mode:changed', 1500),
      'le serveur a change de mode sur la seule volonte du proposant'
    );

    // Refus du partenaire.
    party.guest.emit('mode:respond', { accept: false });
    const refus = await party.host.wait('mode:declined', { timeout: 6000, what: 'refus du partenaire' });
    t.ok(
      '[changement de mode] le refus du partenaire est notifie au proposant',
      typeof refus.data.byName === 'string' && refus.data.byName.length > 0,
      `refus annonce par : ${JSON.stringify(refus.data)}`
    );

    // Nouvelle proposition, acceptee cette fois.
    party.host.emit('mode:propose', { mode: 'escalade' });
    await party.guest.wait('mode:proposal', { timeout: 6000 });
    party.guest.emit('mode:respond', { accept: true });
    const chgHost = await party.host.wait('mode:changed', { timeout: 6000, what: 'confirmation du changement' });
    const chgGuest = await party.guest.wait('mode:changed', { timeout: 4000 });
    t.ok(
      '[changement de mode] l\'acceptation change le mode pour les deux joueurs',
      chgHost.data.mode === 'escalade' && chgGuest.data.mode === 'escalade' &&
        chgHost.data.label === 'Escalade',
      `hote=${JSON.stringify(chgHost.data)}, invite=${JSON.stringify(chgGuest.data)}`
    );

    // Le salon a reellement enregistre le nouveau mode : on le relit par une
    // reconnexion legitime, qui renvoie le recap des reglages.
    const temoin = await Peer.connect(t.url, t.ip, 'temoin');
    try {
      const rec = await temoin.emitAck<any>('room:reconnect', {
        code: party.code, playerId: 1, sessionToken: party.host.sessionToken,
      });
      const reglages = await temoin.wait('room:settings', { timeout: 6000 });
      t.ok(
        '[changement de mode] le nouveau mode est bien celui enregistre dans le salon',
        rec.success === true && reglages.data.gameMode === 'escalade',
        `reconnexion=${JSON.stringify(rec.success)}, mode relu="${reglages.data.gameMode}"`
      );
    } finally {
      temoin.close();
    }
  },
};

// ───────────────────────────────────────────── pause, coupure, reprise ──────
const interruptions: Session = {
  id: 'transverse/interruptions',
  group: 'transverse',
  expected: 7,
  timeoutMs: 220_000,
  async run(t) {
    const party = await t.party({ gameMode: 'classic', questionTypes: ['E'], questionCount: 12 });
    await party.accept();
    await party.start();

    const r1 = await playRound(party, { a1: accord, a2: accord });
    const scoreApresR1 = r1.score;

    // Manche 2 : on met en pause PENDANT la phase de question.
    const q2 = await party.host.wait('game:question', { timeout: 20000, what: 'deuxieme question' });
    const pause = await party.host.emitAck<any>('game:request-pause');
    const pauseHost = await party.host.wait('game:paused', { timeout: 6000, what: 'notification de pause' });
    const pauseGuest = await party.guest.wait('game:paused', { timeout: 4000 });
    t.ok(
      '[interruptions] la pause manuelle suspend la partie pour les deux joueurs',
      pause?.success === true && pause?.paused === true &&
        pauseHost.data.disconnectedPlayer === 1 && !!pauseGuest.data.playerName,
      `accuse=${JSON.stringify(pause)}, notification hote=${JSON.stringify(pauseHost.data)}`
    );

    const enPause = await party.guest.answer(accord(q2.data.question));
    t.ok(
      "[interruptions] aucune reponse n'est acceptee pendant la pause",
      enPause.accepted === false && /pause/i.test(enPause.error ?? ''),
      `reponse du serveur : ${JSON.stringify(enPause)}`
    );

    const reprise = await party.host.emitAck<any>('game:request-pause');
    await party.host.wait('game:resumed', { timeout: 6000, what: 'reprise' });
    const apresReprise = await party.guest.answer(accord(q2.data.question));
    t.ok(
      '[interruptions] la reprise relance la manche en cours',
      reprise?.success === true && reprise?.paused === false && apresReprise.accepted === true,
      `accuse de reprise=${JSON.stringify(reprise)}, reponse apres reprise=${JSON.stringify(apresReprise)}`
    );

    await party.host.answer(accord(q2.data.question));
    const r2reveal = await party.host.wait('game:reveal', { timeout: 15000 });
    const score2 = await party.host.wait('game:score-update', { timeout: 6000 });

    // Manche 3 : coupure franche du joueur 2 en pleine question.
    const q3 = await party.host.wait('game:question', { timeout: 20000, what: 'troisieme question' });
    party.guest.socket.disconnect();
    const coupure = await party.host.wait('game:paused', { timeout: 12000, what: 'pause apres coupure' });
    t.ok(
      "[interruptions] la deconnexion d'un joueur met la partie en pause apres le delai de grace",
      coupure.data.disconnectedPlayer === 2 && typeof coupure.data.playerName === 'string',
      `notification recue : ${JSON.stringify(coupure.data)} (attendu le joueur 2)`
    );

    const revenant = await Peer.connect(t.url, t.ip, 'revenant');
    try {
      const sansJeton = await revenant.emitAck<any>('room:reconnect', { code: party.code, playerId: 2 });
      t.ok(
        '[interruptions] la reconnexion sans jeton de session est refusee',
        sansJeton.success === false && /session/i.test(sansJeton.error ?? ''),
        `reponse du serveur : ${JSON.stringify(sansJeton)}`
      );

      const avecJeton = await revenant.emitAck<any>('room:reconnect', {
        code: party.code, playerId: 2, sessionToken: party.guest.sessionToken,
      });
      const reprisePartie = await party.host.wait('game:resumed', { timeout: 8000, what: 'reprise apres reconnexion' });
      t.ok(
        '[interruptions] la reconnexion avec le bon jeton est acceptee et relance la partie',
        avecJeton.success === true && reprisePartie.data.reconnectedPlayer === 2,
        `reconnexion=${JSON.stringify(avecJeton.success)}, reprise=${JSON.stringify(reprisePartie.data)}`
      );

      const qRevenant = await revenant.wait('game:question', { timeout: 8000, what: 'question renvoyee au revenant' });
      // Le score est envoye AVANT la question dans la sequence de reconnexion :
      // on le relit dans le journal plutot que de l'attendre apres coup.
      const scoreRevenant = revenant.last('game:score-update');
      t.ok(
        '[interruptions] le joueur reconnecte retrouve la question et le score en cours',
        qRevenant.data.question.id === q3.data.question.id &&
          !!scoreRevenant &&
          scoreRevenant.data.score1 === score2.data.score1 &&
          scoreRevenant.data.score2 === score2.data.score2,
        `question renvoyee=${qRevenant.data.question.id} (en cours ${q3.data.question.id}), ` +
          `score renvoye=${scoreRevenant?.data.score1}/${scoreRevenant?.data.score2} ` +
          `(en cours ${score2.data.score1}/${score2.data.score2}) — manche 1 : ${scoreApresR1.score1}/${scoreApresR1.score2}, ` +
          `revelation manche 2 : ${r2reveal.data.points1}/${r2reveal.data.points2}`
      );
    } finally {
      revenant.close();
    }
  },
};

export const transverseSessions: Session[] = [changementDeMode, interruptions];
