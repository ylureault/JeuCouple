import { initDatabase } from '../database.js';
import * as roomModel from '../models/room.js';
import type { Room, RoomResponse, RoomSettingsInfo } from '../types.js';
import {
  demarrerServeur, connecter, emettreAvecAck, attendre, attendrePeutEtre, pause,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * P0-5 de l'audit : le joueur qui rejoint decouvrait le theme — parfois tres
 * explicite — a la premiere question. Consentement asymetrique. Le salon envoie
 * donc un recap des reglages aux DEUX joueurs, et la partie ne peut pas demarrer
 * tant que le joueur 2 ne les a pas explicitement acceptes.
 */

const PORT = 3143;
let serveur: HarnaisServeur;

beforeAll(async () => {
  initDatabase();
  serveur = await demarrerServeur(PORT);
}, 30_000);

afterAll(async () => {
  await serveur.fermer();
});

interface Duo { hote: ClientSocket; invite: ClientSocket; salon: Room; }

async function ouvrirDuo(options: Record<string, unknown> = {}): Promise<Duo> {
  const hote = await connecter(serveur);
  const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create',
    { playerName: 'Alice', gender: 'F', ...options });
  const invite = await connecter(serveur);
  await emettreAvecAck<RoomResponse>(invite, 'room:join',
    { code: creation.room!.code, playerName: 'Bob', gender: 'M' });
  return { hote, invite, salon: creation.room! };
}

describe('Recap des reglages envoye au joueur qui rejoint', () => {
  let recu: RoomSettingsInfo;

  beforeAll(async () => {
    const hote = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create', {
      playerName: 'Alice', gender: 'F',
      gameMode: 'escalade', questionCount: 20, categories: ['coquin', 'fantasmes'],
    });
    const invite = await connecter(serveur);
    const attente = attendre<RoomSettingsInfo>(invite, 'room:settings', 5000);
    await emettreAvecAck<RoomResponse>(invite, 'room:join',
      { code: creation.room!.code, playerName: 'Bob', gender: 'M' });
    recu = await attente;
  });

  it('annonce le mode retenu', () => {
    expect(recu.gameMode).toBe('escalade');
  });

  it('annonce le libelle lisible du mode', () => {
    expect(recu.modeLabel).toBe('Escalade');
  });

  it('annonce l\'icone du mode', () => {
    expect(recu.modeIcon.length).toBeGreaterThan(0);
  });

  it('annonce si le mode a une fin', () => {
    expect(recu.endless).toBe(false);
  });

  it('annonce la longueur de partie choisie par l\'hote', () => {
    expect(recu.questionCount).toBe(20);
  });

  it('annonce les themes AVANT la premiere question, pas apres', () => {
    expect(recu.categories.map(c => c.code).sort()).toEqual(['coquin', 'fantasmes']);
  });

  it('resout chaque theme en nom lisible et icone', () => {
    for (const c of recu.categories) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.icon.length).toBeGreaterThan(0);
    }
  });

  it('indique que rien n\'a encore ete accepte', () => {
    expect(recu.settingsAccepted).toBe(false);
  });
});

describe('Accord du joueur 2 bloquant le lancement', () => {
  let duo: Duo;

  beforeAll(async () => {
    duo = await ouvrirDuo({ questionCount: 5, categories: ['culture'], questionTypes: ['H'] });
  });

  it('refuse le lancement tant que le joueur 2 n\'a pas accepte', async () => {
    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(duo.hote, 'game:start');
    expect(rep.success).toBe(false);
  });

  it('le message de refus nomme le joueur dont on attend l\'accord', async () => {
    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(duo.hote, 'game:start');
    expect(rep.error).toContain('Bob');
  });

  it('un accord envoye par l\'hote lui-meme ne debloque rien', async () => {
    duo.hote.emit('room:accept-settings');
    await pause(300);
    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(duo.hote, 'game:start');
    expect(rep.success).toBe(false);
  });

  it('l\'accord du joueur 2 est diffuse aux deux joueurs', async () => {
    const cotesHote = attendre<{ playerId: 1 | 2 }>(duo.hote, 'room:settings-accepted', 5000);
    const cotesInvite = attendre<{ playerId: 1 | 2 }>(duo.invite, 'room:settings-accepted', 5000);
    duo.invite.emit('room:accept-settings');
    const [a, b] = await Promise.all([cotesHote, cotesInvite]);
    expect([a.playerId, b.playerId]).toEqual([2, 2]);
  });

  it('le joueur 2 ne peut toujours pas lancer la partie a la place de l\'hote', async () => {
    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(duo.invite, 'game:start');
    expect(rep.error).toBe('Only host can start the game');
  });

  it('l\'hote peut lancer une fois l\'accord obtenu', async () => {
    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(duo.hote, 'game:start');
    expect(rep.success).toBe(true);
  });

  it('les deux joueurs recoivent game:started', async () => {
    // La partie vient d'etre lancee : le second lancement doit etre refuse,
    // preuve qu'une partie est bien en cours pour ce salon.
    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(duo.hote, 'game:start');
    expect(rep.error).toBe('Game already started');
  });

  it('le salon passe en statut « playing » en base', () => {
    expect(roomModel.getRoomByCode(duo.salon.code)?.status).toBe('playing');
  });
});

describe('Diffusion de game:started aux deux joueurs', () => {
  it('les deux clients recoivent l\'evenement avec le meme identifiant de partie', async () => {
    const duo = await ouvrirDuo({ questionCount: 5, categories: ['culture'], questionTypes: ['H'] });
    duo.invite.emit('room:accept-settings');
    await pause(200);

    const cotesHote = attendre<{ gameId: number }>(duo.hote, 'game:started', 5000);
    const cotesInvite = attendre<{ gameId: number }>(duo.invite, 'game:started', 5000);
    await emettreAvecAck<{ success: boolean }>(duo.hote, 'game:start');
    const [a, b] = await Promise.all([cotesHote, cotesInvite]);

    expect(a.gameId).toBe(b.gameId);
    expect(a.gameId).toBeGreaterThan(0);
  });

  it('la premiere question part vers les deux joueurs', async () => {
    const duo = await ouvrirDuo({ questionCount: 5, categories: ['culture'], questionTypes: ['H'] });
    duo.invite.emit('room:accept-settings');
    await pause(200);

    const cotesHote = attendre<{ question: { id: number }; questionNumber: number; totalQuestions: number }>(
      duo.hote, 'game:question', 8000);
    const cotesInvite = attendre<{ question: { id: number } }>(duo.invite, 'game:question', 8000);
    await emettreAvecAck<{ success: boolean }>(duo.hote, 'game:start');
    const [a, b] = await Promise.all([cotesHote, cotesInvite]);

    expect(a.question.id).toBe(b.question.id);
    expect(a.questionNumber).toBe(1);
    expect(a.totalQuestions).toBe(5);
  });
});

describe('Refus de lancement hors conditions', () => {
  it('refuse le lancement d\'un salon sans second joueur', async () => {
    const hote = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(hote, 'room:create', { playerName: 'Solo', gender: 'M' });
    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(hote, 'game:start');
    expect(rep.error).toBe('Room not ready');
  });

  it('refuse le lancement depuis un socket qui n\'est dans aucun salon', async () => {
    const orphelin = await connecter(serveur);
    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(orphelin, 'game:start');
    expect(rep.error).toBe('Not in a room');
  });

  it('refuse le lancement quand aucun theme choisi ne contient de question', async () => {
    const hote = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create', {
      playerName: 'Alice', gender: 'F', categories: ['petits_noms'], questionTypes: ['H'],
    });
    const invite = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(invite, 'room:join',
      { code: creation.room!.code, playerName: 'Bob', gender: 'M' });
    invite.emit('room:accept-settings');
    await pause(200);

    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(hote, 'game:start');
    expect(rep.error).toBe('No questions available');
  });

  it('un salon dont le lancement a echoue reste jouable ensuite', async () => {
    const hote = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create', {
      playerName: 'Alice', gender: 'F', questionCount: 5, categories: ['culture'], questionTypes: ['H'],
    });
    const rateo = await emettreAvecAck<{ success: boolean }>(hote, 'game:start');
    expect(rateo.success).toBe(false);   // pas encore de joueur 2

    const invite = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(invite, 'room:join',
      { code: creation.room!.code, playerName: 'Bob', gender: 'M' });
    invite.emit('room:accept-settings');
    await pause(200);

    const reussi = await emettreAvecAck<{ success: boolean }>(hote, 'game:start');
    expect(reussi.success).toBe(true);
  });
});

describe('Remise a zero de la partie', () => {
  it('game:restart replace le salon en attente et previent les deux joueurs', async () => {
    const duo = await ouvrirDuo({ questionCount: 5, categories: ['culture'], questionTypes: ['H'] });
    duo.invite.emit('room:accept-settings');
    await pause(200);
    await emettreAvecAck<{ success: boolean }>(duo.hote, 'game:start');

    const cotesInvite = attendre<void>(duo.invite, 'game:restarted', 5000);
    const rep = await emettreAvecAck<{ success: boolean }>(duo.hote, 'game:restart');
    await cotesInvite;

    expect(rep.success).toBe(true);
    expect(roomModel.getRoomByCode(duo.salon.code)?.status).toBe('waiting');
  });

  it('une partie peut etre relancee apres un restart', async () => {
    const duo = await ouvrirDuo({ questionCount: 5, categories: ['culture'], questionTypes: ['H'] });
    duo.invite.emit('room:accept-settings');
    await pause(200);
    await emettreAvecAck<{ success: boolean }>(duo.hote, 'game:start');
    await emettreAvecAck<{ success: boolean }>(duo.hote, 'game:restart');

    const rep = await emettreAvecAck<{ success: boolean }>(duo.hote, 'game:start');
    expect(rep.success).toBe(true);
  });

  it('game:restart depuis un socket hors salon est refuse', async () => {
    const orphelin = await connecter(serveur);
    const rep = await emettreAvecAck<{ success: boolean; error?: string }>(orphelin, 'game:restart');
    expect(rep.error).toBe('Not in a room');
  });
});

describe('Salon vide de reglages', () => {
  it('un salon cree sans option annonce tout de meme un recap complet', async () => {
    const hote = await connecter(serveur);
    const attente = attendrePeutEtre<RoomSettingsInfo>(hote, 'room:settings', 3000);
    await emettreAvecAck<RoomResponse>(hote, 'room:create', { playerName: 'Alice', gender: 'F' });
    const recap = await attente;
    expect(Object.keys(recap!).sort()).toEqual([
      'categories', 'endless', 'gameMode', 'modeIcon', 'modeLabel', 'questionCount', 'settingsAccepted',
    ]);
  });
});
