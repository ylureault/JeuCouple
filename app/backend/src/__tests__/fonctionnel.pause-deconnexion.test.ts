import { initDatabase } from '../database.js';
import * as roomModel from '../models/room.js';
import type { Question, Room, RoomResponse } from '../types.js';
import {
  demarrerServeur, connecter, emettreAvecAck, attendre, attendrePeutEtre, pause,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * Pause manuelle, deconnexion et reprise.
 *
 * Une deconnexion ne met pas la partie en pause immediatement : un delai de
 * grace de 5 secondes couvre les micro-coupures reseau (metro, ascenseur). Au-dela,
 * tous les minuteurs sont geles et le partenaire est prevenu, pour ne pas laisser
 * quelqu'un repondre seul a une question qu'il croit partagee.
 */

const PORT = 3145;
const DELAI_GRACE_MS = 5000;

let serveur: HarnaisServeur;

interface Partie {
  hote: ClientSocket; invite: ClientSocket; salon: Room;
  question: Question; jetonInvite: string;
}

beforeAll(async () => {
  initDatabase();
  serveur = await demarrerServeur(PORT);
}, 30_000);

afterAll(async () => {
  await serveur.fermer();
});

async function lancerPartie(): Promise<Partie> {
  const hote = await connecter(serveur);
  const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create', {
    playerName: 'Alice', gender: 'F',
    questionCount: 5, categories: ['culture'], questionTypes: ['H'],
  });
  const invite = await connecter(serveur);
  const join = await emettreAvecAck<RoomResponse>(invite, 'room:join',
    { code: creation.room!.code, playerName: 'Bob', gender: 'M' });
  invite.emit('room:accept-settings');
  await pause(200);

  const attenteQuestion = attendre<{ question: Question }>(hote, 'game:question', 10_000);
  await emettreAvecAck<{ success: boolean }>(hote, 'game:start');
  const { question } = await attenteQuestion;
  return { hote, invite, salon: creation.room!, question, jetonInvite: join.sessionToken! };
}

describe('Pause manuelle demandee par un joueur', () => {
  let partie: Partie;
  let pauseAck: { success: boolean; paused?: boolean };
  let repriseAck: { success: boolean; paused?: boolean };
  let annoncePause: { disconnectedPlayer: 1 | 2; playerName: string };
  let annonceReprise: { reconnectedPlayer: 1 | 2; playerName: string };

  beforeAll(async () => {
    partie = await lancerPartie();

    const attentePause = attendre<typeof annoncePause>(partie.invite, 'game:paused', 6000);
    pauseAck = await emettreAvecAck(partie.hote, 'game:request-pause');
    annoncePause = await attentePause;

    const attenteReprise = attendre<typeof annonceReprise>(partie.invite, 'game:resumed', 6000);
    repriseAck = await emettreAvecAck(partie.hote, 'game:request-pause');
    annonceReprise = await attenteReprise;
  }, 40_000);

  it('confirme la mise en pause a celui qui la demande', () => {
    expect(pauseAck).toEqual({ success: true, paused: true });
  });

  it('previent le partenaire de la mise en pause', () => {
    expect(annoncePause.disconnectedPlayer).toBe(1);
  });

  it('le message de pause nomme le joueur a l\'origine', () => {
    expect(annoncePause.playerName).toContain('Alice');
  });

  it('le message de pause dit qu\'il s\'agit d\'une pause volontaire', () => {
    expect(annoncePause.playerName).toContain('pause');
  });

  it('la meme commande reprend la partie', () => {
    expect(repriseAck).toEqual({ success: true, paused: false });
  });

  it('previent le partenaire de la reprise', () => {
    expect(annonceReprise.reconnectedPlayer).toBe(1);
  });

  it('le partenaire peut aussi mettre en pause', async () => {
    const ack = await emettreAvecAck<{ success: boolean; paused?: boolean }>(
      partie.invite, 'game:request-pause');
    expect(ack.paused).toBe(true);
    await emettreAvecAck(partie.invite, 'game:request-pause');
  });

  it('refuse une pause hors partie', async () => {
    const hote = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(hote, 'room:create', { playerName: 'Solo', gender: 'M' });
    const ack = await emettreAvecAck<{ success: boolean }>(hote, 'game:request-pause');
    expect(ack.success).toBe(false);
  });

  it('refuse une pause depuis un socket hors salon', async () => {
    const orphelin = await connecter(serveur);
    const ack = await emettreAvecAck<{ success: boolean }>(orphelin, 'game:request-pause');
    expect(ack.success).toBe(false);
  });
});

describe('Deconnexion en pleine partie', () => {
  let partie: Partie;
  let annonce: { disconnectedPlayer: 1 | 2; playerName: string };
  let pauseTropTot: unknown;

  beforeAll(async () => {
    partie = await lancerPartie();
    const attentePause = attendre<typeof annonce>(partie.hote, 'game:paused', 15_000);
    partie.invite.disconnect();
    // Pendant le delai de grace, rien ne doit encore etre annonce.
    pauseTropTot = await attendrePeutEtre(partie.hote, 'game:paused', DELAI_GRACE_MS - 2000);
    annonce = await attentePause;
  }, 45_000);

  it('ne met pas la partie en pause pendant le delai de grace', () => {
    expect(pauseTropTot).toBeNull();
  });

  it('met la partie en pause une fois le delai de grace ecoule', () => {
    expect(annonce).not.toBeUndefined();
  });

  it('designe le joueur qui a disparu', () => {
    expect(annonce.disconnectedPlayer).toBe(2);
  });

  it('nomme le joueur attendu, pour que l\'autre sache qui il attend', () => {
    expect(annonce.playerName).toBe('Bob');
  });

  it('refuse les reponses tant que le partenaire n\'est pas revenu', async () => {
    const ack = await emettreAvecAck<{ accepted: boolean; error?: string }>(
      partie.hote, 'game:answer', { answer: 'tout seul' });
    expect(ack).toEqual({ accepted: false, error: 'La partie est en pause' });
  });

  it('la reconnexion avec le bon jeton relance la partie', async () => {
    const revenant = await connecter(serveur);
    const attenteReprise = attendre<{ reconnectedPlayer: 1 | 2; playerName: string }>(
      partie.hote, 'game:resumed', 10_000);
    const rep = await emettreAvecAck<RoomResponse>(revenant, 'room:reconnect', {
      code: partie.salon.code, playerId: 2, sessionToken: partie.jetonInvite,
    });
    const reprise = await attenteReprise;

    expect(rep.success).toBe(true);
    expect(reprise.reconnectedPlayer).toBe(2);
    expect(reprise.playerName).toBe('Bob');
  }, 20_000);

  it('les reponses sont a nouveau acceptees apres la reprise', async () => {
    const ack = await emettreAvecAck<{ accepted: boolean }>(
      partie.hote, 'game:answer', { answer: 'ensemble' });
    expect(ack.accepted).toBe(true);
  });
});

describe('Reconnexion pendant le delai de grace', () => {
  it('ne declenche aucune pause si le joueur revient tres vite', async () => {
    const partie = await lancerPartie();
    const espion = attendrePeutEtre<{ playerName: string }>(partie.hote, 'game:paused', DELAI_GRACE_MS + 2500);

    partie.invite.disconnect();
    await pause(500);

    const revenant = await connecter(serveur);
    const rep = await emettreAvecAck<RoomResponse>(revenant, 'room:reconnect', {
      code: partie.salon.code, playerId: 2, sessionToken: partie.jetonInvite,
    });
    expect(rep.success).toBe(true);
    expect(await espion).toBeNull();
  }, 45_000);
});

describe('Etat de partie renvoye au joueur qui revient', () => {
  let rep: RoomResponse;
  let partie: Partie;
  let demarrage: { gameId: number } | null;
  let scores: { score1: number; score2: number } | null;
  let question: { question: Question; questionNumber: number } | null;

  beforeAll(async () => {
    partie = await lancerPartie();
    partie.invite.disconnect();
    await pause(300);

    const revenant = await connecter(serveur);
    const attenteDemarrage = attendrePeutEtre<{ gameId: number }>(revenant, 'game:started', 5000);
    const attenteScores = attendrePeutEtre<{ score1: number; score2: number }>(revenant, 'game:score-update', 5000);
    const attenteQuestion = attendrePeutEtre<{ question: Question; questionNumber: number }>(
      revenant, 'game:question', 5000);

    rep = await emettreAvecAck<RoomResponse>(revenant, 'room:reconnect', {
      code: partie.salon.code, playerId: 2, sessionToken: partie.jetonInvite,
    });
    demarrage = await attenteDemarrage;
    scores = await attenteScores;
    question = await attenteQuestion;
  }, 45_000);

  it('accepte le retour', () => {
    expect(rep.success).toBe(true);
  });

  it('annonce qu\'une partie est en cours', () => {
    expect(demarrage).not.toBeNull();
  });

  it('renvoie les scores en cours', () => {
    expect(scores).toEqual({ score1: 0, score2: 0 });
  });

  it('renvoie la question en cours, pas une nouvelle', () => {
    expect(question!.question.id).toBe(partie.question.id);
  });

  it('renvoie le bon numero de manche', () => {
    expect(question!.questionNumber).toBe(1);
  });

  it('le salon reste en statut « playing »', () => {
    expect(roomModel.getRoomByCode(partie.salon.code)?.status).toBe('playing');
  });
});
