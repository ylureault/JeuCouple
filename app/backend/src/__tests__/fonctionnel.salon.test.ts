import { initDatabase } from '../database.js';
import * as roomModel from '../models/room.js';
import type { Room, RoomResponse, RoomSettingsInfo } from '../types.js';
import {
  demarrerServeur, connecter, emettreAvecAck, attendre, attendrePeutEtre,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * Cycle de vie d'un salon, joue contre le VRAI serveur socket de production.
 *
 * Chaque `room:join` consomme une unite du limiteur de debit (15/minute par IP)
 * partage par toute la suite : les scenarios sont donc regroupes et un salon
 * n'est rejoint que lorsque c'est indispensable.
 */

const PORT = 3141;
let serveur: HarnaisServeur;

beforeAll(async () => {
  initDatabase();
  serveur = await demarrerServeur(PORT);
}, 30_000);

afterAll(async () => {
  await serveur.fermer();
});

describe('Creation d\'un salon', () => {
  let hote: ClientSocket;
  let reponse: RoomResponse;
  let reglages: RoomSettingsInfo | null;

  beforeAll(async () => {
    hote = await connecter(serveur);
    const attenteReglages = attendrePeutEtre<RoomSettingsInfo>(hote, 'room:settings', 3000);
    reponse = await emettreAvecAck<RoomResponse>(hote, 'room:create', {
      playerName: 'Alice', gender: 'F',
    });
    reglages = await attenteReglages;
  });

  it('accepte la creation', () => {
    expect(reponse.success).toBe(true);
  });

  it('rend un code de salon a six chiffres', () => {
    expect(reponse.room!.code).toMatch(/^\d{6}$/);
  });

  it('designe le createur comme joueur 1', () => {
    expect(reponse.playerId).toBe(1);
  });

  it('enregistre le nom et le genre du createur', () => {
    expect([reponse.room!.player1_name, reponse.room!.player1_gender]).toEqual(['Alice', 'F']);
  });

  it('laisse la place du second joueur libre', () => {
    expect(reponse.room!.player2_name).toBeNull();
  });

  it('place le salon en attente', () => {
    expect(reponse.room!.status).toBe('waiting');
  });

  it('remet un jeton de session secret', () => {
    expect(typeof reponse.sessionToken).toBe('string');
    expect(reponse.sessionToken!.length).toBeGreaterThan(20);
  });

  it('le jeton remis est bien celui enregistre en base', () => {
    expect(roomModel.verifySessionToken(reponse.room!.id, 1, reponse.sessionToken)).toBe(true);
  });

  it('le salon existe reellement en base', () => {
    expect(roomModel.getRoomByCode(reponse.room!.code)?.id).toBe(reponse.room!.id);
  });

  it('envoie immediatement le recap des reglages au createur', () => {
    expect(reglages).not.toBeNull();
  });

  it('le recap annonce le mode classique par defaut', () => {
    expect(reglages!.gameMode).toBe('classic');
  });

  it('le recap porte un libelle et une icone de mode', () => {
    expect(reglages!.modeLabel.length).toBeGreaterThan(2);
    expect(reglages!.modeIcon.length).toBeGreaterThan(0);
  });

  it('le recap annonce dix questions par defaut', () => {
    expect(reglages!.questionCount).toBe(10);
  });

  it('le recap annonce « tous les themes » quand rien n\'est choisi', () => {
    expect(reglages!.categories).toEqual([]);
  });

  it('le recap indique que le second joueur n\'a encore rien accepte', () => {
    expect(reglages!.settingsAccepted).toBe(false);
  });
});

describe('Reglages retenus a la creation', () => {
  const creer = async (donnees: Record<string, unknown>) => {
    const client = await connecter(serveur);
    const attente = attendrePeutEtre<RoomSettingsInfo>(client, 'room:settings', 3000);
    const rep = await emettreAvecAck<RoomResponse>(client, 'room:create',
      { playerName: 'Hote', gender: 'M', ...donnees });
    const reglages = await attente;
    return { client, rep, reglages };
  };

  it('accepte un nombre de questions dans les bornes', async () => {
    const { reglages } = await creer({ questionCount: 15 });
    expect(reglages!.questionCount).toBe(15);
  });

  it('accepte la borne basse de cinq questions', async () => {
    const { reglages } = await creer({ questionCount: 5 });
    expect(reglages!.questionCount).toBe(5);
  });

  it('ramene un nombre de questions trop petit a la valeur par defaut', async () => {
    const { reglages } = await creer({ questionCount: 3 });
    expect(reglages!.questionCount).toBe(10);
  });

  it('ramene un nombre de questions trop grand a la valeur par defaut', async () => {
    const { reglages } = await creer({ questionCount: 500 });
    expect(reglages!.questionCount).toBe(10);
  });

  it('conserve les themes choisis par l\'hote', async () => {
    const { reglages } = await creer({ categories: ['couple', 'fun'] });
    expect(reglages!.categories.map(c => c.code).sort()).toEqual(['couple', 'fun']);
  });

  it('resout les themes en nom et icone affichables', async () => {
    const { reglages } = await creer({ categories: ['couple'] });
    expect(reglages!.categories[0].name.length).toBeGreaterThan(0);
    expect(reglages!.categories[0].icon.length).toBeGreaterThan(0);
  });

  it('ecarte du recap un theme inconnu', async () => {
    const { reglages } = await creer({ categories: ['couple', 'theme_bidon'] });
    expect(reglages!.categories.map(c => c.code)).toEqual(['couple']);
  });

  it('retient un mode de jeu valide', async () => {
    const { reglages } = await creer({ gameMode: 'duel' });
    expect(reglages!.gameMode).toBe('duel');
  });

  it('annonce qu\'un mode sans fin n\'a pas de compteur de questions', async () => {
    const { reglages } = await creer({ gameMode: 'duel' });
    expect(reglages!.endless).toBe(true);
  });

  it('annonce qu\'un mode a liste fixe a un compteur', async () => {
    const { reglages } = await creer({ gameMode: 'classic' });
    expect(reglages!.endless).toBe(false);
  });

  it('retombe sur le mode classique pour un mode inconnu', async () => {
    const { reglages } = await creer({ gameMode: 'poker_menteur' });
    expect(reglages!.gameMode).toBe('classic');
  });

  it('le mode « mix » efface toute restriction de theme', async () => {
    const { reglages } = await creer({ gameMode: 'mix', categories: ['couple', 'fun'] });
    expect(reglages!.categories).toEqual([]);
  });

  it('deux salons crees coup sur coup ont des codes differents', async () => {
    const a = await creer({});
    const b = await creer({});
    expect(a.rep.room!.code).not.toBe(b.rep.room!.code);
  });
});

describe('Rejoindre un salon', () => {
  let hote: ClientSocket;
  let invite: ClientSocket;
  let salon: Room;
  let reponseJoin: RoomResponse;
  let notificationHote: { playerName: string; playerId: 1 | 2; gender: string } | null;

  beforeAll(async () => {
    hote = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create',
      { playerName: 'Alice', gender: 'F' });
    salon = creation.room!;

    invite = await connecter(serveur);
    const attenteNotif = attendrePeutEtre<{ playerName: string; playerId: 1 | 2; gender: string }>(
      hote, 'room:player-joined', 3000);
    reponseJoin = await emettreAvecAck<RoomResponse>(invite, 'room:join',
      { code: salon.code, playerName: 'Bob', gender: 'M' });
    notificationHote = await attenteNotif;
  });

  it('accepte le second joueur', () => {
    expect(reponseJoin.success).toBe(true);
  });

  it('le designe comme joueur 2', () => {
    expect(reponseJoin.playerId).toBe(2);
  });

  it('renvoie un salon desormais complet', () => {
    expect(reponseJoin.room!.player2_name).toBe('Bob');
  });

  it('lui remet son propre jeton de session', () => {
    expect(reponseJoin.sessionToken!.length).toBeGreaterThan(20);
  });

  it('le jeton du joueur 2 est distinct de celui du joueur 1', () => {
    expect(roomModel.verifySessionToken(salon.id, 1, reponseJoin.sessionToken)).toBe(false);
    expect(roomModel.verifySessionToken(salon.id, 2, reponseJoin.sessionToken)).toBe(true);
  });

  it('previent l\'hote de l\'arrivee', () => {
    expect(notificationHote).not.toBeNull();
  });

  it('la notification porte le nom, le numero et le genre du nouvel arrivant', () => {
    expect(notificationHote).toMatchObject({ playerName: 'Bob', playerId: 2, gender: 'M' });
  });

  it('refuse un troisieme joueur : le salon est plein', async () => {
    const troisieme = await connecter(serveur);
    const rep = await emettreAvecAck<RoomResponse>(troisieme, 'room:join',
      { code: salon.code, playerName: 'Carl', gender: 'M' });
    expect(rep.success).toBe(false);
    expect(rep.error).toBe('Room not found or full');
  });

  it('refuse un code de salon inconnu', async () => {
    const client = await connecter(serveur);
    const rep = await emettreAvecAck<RoomResponse>(client, 'room:join',
      { code: '000000', playerName: 'Perdu', gender: 'M' });
    expect(rep.success).toBe(false);
    expect(rep.error).toBe('Room not found or full');
  });

  it('ne fuite jamais de jeton de session dans un refus', async () => {
    const client = await connecter(serveur);
    const rep = await emettreAvecAck<RoomResponse>(client, 'room:join',
      { code: '000001', playerName: 'Perdu', gender: 'M' });
    expect(rep.sessionToken).toBeUndefined();
  });

  it('refuse de rejoindre une partie deja lancee', async () => {
    const client = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(client, 'room:create',
      { playerName: 'Solo', gender: 'M' });
    roomModel.updateRoomStatus(creation.room!.id, 'playing');

    const retardataire = await connecter(serveur);
    const rep = await emettreAvecAck<RoomResponse>(retardataire, 'room:join',
      { code: creation.room!.code, playerName: 'Tard', gender: 'F' });
    expect(rep.success).toBe(false);
  });

  it('renvoie le recap des reglages aux deux joueurs apres le join', async () => {
    const h = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(h, 'room:create',
      { playerName: 'Hote', gender: 'F', gameMode: 'complices' });
    const i = await connecter(serveur);
    const attenteHote = attendrePeutEtre<RoomSettingsInfo>(h, 'room:settings', 3000);
    const attenteInvite = attendrePeutEtre<RoomSettingsInfo>(i, 'room:settings', 3000);
    await emettreAvecAck<RoomResponse>(i, 'room:join',
      { code: creation.room!.code, playerName: 'Invite', gender: 'M' });

    const [cotesHote, cotesInvite] = await Promise.all([attenteHote, attenteInvite]);
    expect(cotesHote?.gameMode).toBe('complices');
    expect(cotesInvite?.gameMode).toBe('complices');
  });
});

describe('Quitter un salon', () => {
  it('libere la place en base quand un joueur quitte le lobby', async () => {
    const h = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(h, 'room:create',
      { playerName: 'Hote', gender: 'F' });
    const i = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(i, 'room:join',
      { code: creation.room!.code, playerName: 'Passant', gender: 'M' });

    const attenteDepart = attendre<{ playerId: 1 | 2 }>(h, 'room:player-left', 5000);
    i.emit('room:leave');
    const depart = await attenteDepart;

    expect(depart.playerId).toBe(2);
    expect(roomModel.getRoomByCode(creation.room!.code)?.player2_name).toBeNull();
  });

  it('previent le partenaire d\'une deconnexion brutale au lobby', async () => {
    const h = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(h, 'room:create',
      { playerName: 'Hote', gender: 'F' });
    const i = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(i, 'room:join',
      { code: creation.room!.code, playerName: 'Fugitif', gender: 'M' });

    const attenteDepart = attendre<{ playerId: 1 | 2 }>(h, 'room:player-left', 5000);
    i.disconnect();
    await expect(attenteDepart).resolves.toMatchObject({ playerId: 2 });
  });
});
