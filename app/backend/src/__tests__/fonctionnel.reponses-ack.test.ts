import { db, initDatabase } from '../database.js';
import type { Question, Room, RoomResponse, GameRevealData } from '../types.js';
import {
  demarrerServeur, connecter, emettreAvecAck, attendre, attendrePeutEtre, pause,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * Accuse de reception des reponses (arbitrage TL-3 + Secu 7).
 *
 * Une reponse refusee est DITE au joueur : on ne tronque jamais une confession
 * en silence. Chaque refus a son motif, et chaque motif est teste ici contre le
 * vrai serveur.
 */

const PORT = 3144;
let serveur: HarnaisServeur;

interface Ack { accepted: boolean; error?: string }
interface Partie { hote: ClientSocket; invite: ClientSocket; salon: Room; question: Question }

beforeAll(async () => {
  initDatabase();
  serveur = await demarrerServeur(PORT);
}, 30_000);

afterAll(async () => {
  await serveur.fermer();
});

async function lancerPartie(options: Record<string, unknown> = {}): Promise<Partie> {
  const hote = await connecter(serveur);
  const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create', {
    playerName: 'Alice', gender: 'F',
    questionCount: 5, categories: ['culture'], questionTypes: ['H'], ...options,
  });
  const invite = await connecter(serveur);
  await emettreAvecAck<RoomResponse>(invite, 'room:join',
    { code: creation.room!.code, playerName: 'Bob', gender: 'M' });
  invite.emit('room:accept-settings');
  await pause(200);

  const attenteQuestion = attendre<{ question: Question }>(hote, 'game:question', 10_000);
  await emettreAvecAck<{ success: boolean }>(hote, 'game:start');
  const { question } = await attenteQuestion;
  return { hote, invite, salon: creation.room!, question };
}

describe('Accuse de reception d\'une reponse', () => {
  let partie: Partie;
  const acks: Record<string, Ack> = {};
  let partenaireNotifie: { playerId: 1 | 2 } | null = null;
  let revelation: GameRevealData;

  beforeAll(async () => {
    partie = await lancerPartie();

    const attenteNotif = attendrePeutEtre<{ playerId: 1 | 2 }>(
      partie.invite, 'game:player-answered', 3000);

    acks.accepte = await emettreAvecAck<Ack>(partie.hote, 'game:answer', { answer: 'ma reponse' });
    partenaireNotifie = await attenteNotif;

    acks.doublon = await emettreAvecAck<Ack>(partie.hote, 'game:answer', { answer: 'une autre' });
    acks.vide = await emettreAvecAck<Ack>(partie.invite, 'game:answer', { answer: '' });
    acks.nonTexte = await emettreAvecAck<Ack>(partie.invite, 'game:answer', { answer: 42 });
    acks.sansChamp = await emettreAvecAck<Ack>(partie.invite, 'game:answer', {});
    acks.tropLong = await emettreAvecAck<Ack>(partie.invite, 'game:answer', { answer: 'x'.repeat(501) });

    const attenteRevelation = attendre<GameRevealData>(partie.hote, 'game:reveal', 10_000);
    acks.limite = await emettreAvecAck<Ack>(partie.invite, 'game:answer', { answer: 'y'.repeat(500) });
    revelation = await attenteRevelation;

    acks.horsPhase = await emettreAvecAck<Ack>(partie.hote, 'game:answer', { answer: 'trop tard' });
  }, 40_000);

  it('accepte une reponse normale', () => {
    expect(acks.accepte).toEqual({ accepted: true });
  });

  it('previent le partenaire qu\'un joueur a repondu', () => {
    expect(partenaireNotifie).toEqual({ playerId: 1 });
  });

  it('refuse une seconde reponse du meme joueur', () => {
    expect(acks.doublon.accepted).toBe(false);
    expect(acks.doublon.error).toBe('Reponse deja enregistree');
  });

  it('refuse une reponse vide', () => {
    expect(acks.vide).toEqual({ accepted: false, error: 'Reponse vide ou invalide' });
  });

  it('refuse une reponse qui n\'est pas du texte', () => {
    expect(acks.nonTexte.accepted).toBe(false);
  });

  it('refuse une trame sans champ de reponse', () => {
    expect(acks.sansChamp.accepted).toBe(false);
  });

  it('refuse une reponse de plus de 500 caracteres', () => {
    expect(acks.tropLong).toEqual({
      accepted: false, error: 'Reponse trop longue (500 caracteres maximum)',
    });
  });

  it('accepte une reponse d\'exactement 500 caracteres', () => {
    expect(acks.limite).toEqual({ accepted: true });
  });

  it('refuse une reponse arrivee apres la revelation', () => {
    expect(acks.horsPhase).toEqual({ accepted: false, error: 'La question est deja terminee' });
  });

  it('revele les deux reponses telles qu\'elles ont ete envoyees', () => {
    expect(revelation.answer1).toBe('ma reponse');
    expect(revelation.answer2!.length).toBe(500);
  });

  it('la revelation porte l\'identifiant de la question jouee', () => {
    expect(revelation.questionId).toBe(partie.question.id);
  });

  it('la revelation annonce le delai avant la question suivante', () => {
    expect(revelation.nextInSeconds).toBeGreaterThan(0);
  });

  it('la reponse a bien ete persistee en base pendant la manche', () => {
    // La purge de fin de partie n'a pas encore eu lieu : la trace existe.
    const ligne = db.prepare(
      'SELECT answer FROM answers WHERE question_id = ? AND player_id = 1 ORDER BY id DESC LIMIT 1'
    ).get(partie.question.id) as { answer: string } | undefined;
    expect(ligne?.answer).toBe('ma reponse');
  });

  it('la reponse refusee n\'a PAS ete persistee', () => {
    const lignes = db.prepare(
      'SELECT COUNT(*) c FROM answers WHERE question_id = ? AND player_id = 1'
    ).get(partie.question.id) as { c: number };
    expect(lignes.c).toBe(1);
  });
});

describe('Reponse hors partie', () => {
  it('refuse une reponse quand aucune partie n\'est lancee', async () => {
    const hote = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(hote, 'room:create', { playerName: 'Alice', gender: 'F' });
    const ack = await emettreAvecAck<Ack>(hote, 'game:answer', { answer: 'coucou' });
    expect(ack).toEqual({ accepted: false, error: 'Aucune partie en cours' });
  });

  it('refuse une reponse d\'un socket qui n\'appartient a aucun salon', async () => {
    const orphelin = await connecter(serveur);
    const ack = await emettreAvecAck<Ack>(orphelin, 'game:answer', { answer: 'coucou' });
    expect(ack).toEqual({ accepted: false, error: 'Connexion au salon perdue' });
  });

  it('verifie l\'appartenance au salon avant meme le contenu de la reponse', async () => {
    const orphelin = await connecter(serveur);
    const ack = await emettreAvecAck<Ack>(orphelin, 'game:answer', { answer: '' });
    expect(ack.error).toBe('Connexion au salon perdue');
  });
});

describe('Reponse pendant une pause', () => {
  it('refuse une reponse quand la partie est en pause', async () => {
    const partie = await lancerPartie();
    await emettreAvecAck<{ success: boolean; paused?: boolean }>(partie.hote, 'game:request-pause');
    const ack = await emettreAvecAck<Ack>(partie.hote, 'game:answer', { answer: 'pendant la pause' });
    expect(ack).toEqual({ accepted: false, error: 'La partie est en pause' });
  }, 40_000);

  it('accepte a nouveau une reponse apres la reprise', async () => {
    const partie = await lancerPartie();
    await emettreAvecAck<{ success: boolean }>(partie.hote, 'game:request-pause');
    await emettreAvecAck<{ success: boolean }>(partie.hote, 'game:request-pause');
    const ack = await emettreAvecAck<Ack>(partie.hote, 'game:answer', { answer: 'apres reprise' });
    expect(ack).toEqual({ accepted: true });
  }, 40_000);
});

describe('« Passer » ne coute rien, contrairement au joker', () => {
  let passer: GameRevealData;
  let joker: GameRevealData;

  beforeAll(async () => {
    const a = await lancerPartie();
    const attentePasser = attendre<GameRevealData>(a.hote, 'game:reveal', 10_000);
    await emettreAvecAck<Ack>(a.hote, 'game:answer', { answer: 'passer' });
    await emettreAvecAck<Ack>(a.invite, 'game:answer', { answer: 'passer' });
    passer = await attentePasser;

    const b = await lancerPartie();
    const attenteJoker = attendre<GameRevealData>(b.hote, 'game:reveal', 10_000);
    await emettreAvecAck<Ack>(b.hote, 'game:answer', { answer: 'joker' });
    await emettreAvecAck<Ack>(b.invite, 'game:answer', { answer: 'joker' });
    joker = await attenteJoker;
  }, 60_000);

  it('poser une limite ne retire aucun point au joueur 1', () => {
    expect(passer.points1).toBe(0);
  });

  it('poser une limite ne retire aucun point au joueur 2', () => {
    expect(passer.points2).toBe(0);
  });

  it('poser une limite ne casse pas la serie', () => {
    expect(passer.streak1).toBe(0);   // aucune serie en cours a la premiere manche
    expect(passer.streakBonus1).toBe(0);
  });

  it('le joker, lui, est bien penalise', () => {
    expect(joker.points1).toBeLessThan(0);
    expect(joker.points2).toBeLessThan(0);
  });

  it('passer coute strictement moins cher que le joker', () => {
    expect(passer.points1).toBeGreaterThan(joker.points1);
  });

  it('ni « passer » ni « joker » ne sont comptes comme un accord', () => {
    expect(passer.correct).toBe(false);
    expect(joker.correct).toBe(false);
  });
});
