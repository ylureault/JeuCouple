import { initDatabase } from '../database.js';
import * as roomModel from '../models/room.js';
import type { Room, RoomResponse, RoomSettingsInfo } from '../types.js';
import {
  demarrerServeur, connecter, emettreAvecAck, attendrePeutEtre,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * Jetons de session et reconnexion.
 *
 * Constat Secu 4 de l'audit : connaitre le code d'un salon suffisait a s'asseoir
 * dans le fauteuil d'un joueur, donc a lire ses reponses intimes. Le jeton remis
 * a la creation / au join est desormais la SEULE preuve d'appartenance acceptee.
 */

const PORT = 3142;
let serveur: HarnaisServeur;
let hote: ClientSocket;
let invite: ClientSocket;
let salon: Room;
let jetonHote: string;
let jetonInvite: string;

beforeAll(async () => {
  initDatabase();
  serveur = await demarrerServeur(PORT);

  hote = await connecter(serveur);
  const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create',
    { playerName: 'Alice', gender: 'F', gameMode: 'duel' });
  salon = creation.room!;
  jetonHote = creation.sessionToken!;

  invite = await connecter(serveur);
  const join = await emettreAvecAck<RoomResponse>(invite, 'room:join',
    { code: salon.code, playerName: 'Bob', gender: 'M' });
  jetonInvite = join.sessionToken!;
}, 30_000);

afterAll(async () => {
  await serveur.fermer();
});

const reconnecter = async (donnees: Record<string, unknown>) => {
  const client = await connecter(serveur);
  const rep = await emettreAvecAck<RoomResponse>(client, 'room:reconnect', donnees);
  return { client, rep };
};

describe('Reconnexion refusee sans preuve d\'appartenance', () => {
  it('refuse une reconnexion sans jeton', async () => {
    const { rep } = await reconnecter({ code: salon.code, playerId: 1 });
    expect(rep.success).toBe(false);
    expect(rep.error).toBe('Session invalide pour ce salon');
  });

  it('refuse un jeton fabrique', async () => {
    const { rep } = await reconnecter({ code: salon.code, playerId: 1, sessionToken: 'jeton-bidon' });
    expect(rep.success).toBe(false);
  });

  it('refuse un jeton vide', async () => {
    const { rep } = await reconnecter({ code: salon.code, playerId: 1, sessionToken: '' });
    expect(rep.success).toBe(false);
  });

  it('refuse le jeton de l\'autre joueur du meme salon', async () => {
    const { rep } = await reconnecter({ code: salon.code, playerId: 1, sessionToken: jetonInvite });
    expect(rep.success).toBe(false);
    expect(rep.error).toBe('Session invalide pour ce salon');
  });

  it('refuse le jeton de l\'hote pour prendre la place de l\'invite', async () => {
    const { rep } = await reconnecter({ code: salon.code, playerId: 2, sessionToken: jetonHote });
    expect(rep.success).toBe(false);
  });

  it('refuse un jeton valide mais emis pour un autre salon', async () => {
    const autre = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(autre, 'room:create',
      { playerName: 'Ailleurs', gender: 'M' });
    const { rep } = await reconnecter({
      code: salon.code, playerId: 1, sessionToken: creation.sessionToken,
    });
    expect(rep.success).toBe(false);
  });

  it('ne rend jamais le salon dans une reconnexion refusee', async () => {
    const { rep } = await reconnecter({ code: salon.code, playerId: 2, sessionToken: 'faux' });
    expect(rep.room).toBeUndefined();
  });
});

describe('Reconnexion refusee avant meme la verification du jeton', () => {
  it('refuse un numero de joueur invalide', async () => {
    const { rep } = await reconnecter({ code: salon.code, playerId: 3, sessionToken: jetonHote });
    expect(rep.error).toBe('Invalid reconnection data');
  });

  it('refuse un numero de joueur manquant', async () => {
    const { rep } = await reconnecter({ code: salon.code, sessionToken: jetonHote });
    expect(rep.error).toBe('Invalid reconnection data');
  });

  it('refuse un code de salon manquant', async () => {
    const { rep } = await reconnecter({ playerId: 1, sessionToken: jetonHote });
    expect(rep.error).toBe('Invalid reconnection data');
  });

  it('refuse un code de salon inconnu', async () => {
    const { rep } = await reconnecter({ code: '000000', playerId: 1, sessionToken: jetonHote });
    expect(rep.error).toBe('Room not found');
  });

  it('refuse la reconnexion a une partie terminee', async () => {
    const client = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(client, 'room:create',
      { playerName: 'Fini', gender: 'M' });
    roomModel.updateRoomStatus(creation.room!.id, 'finished');
    const { rep } = await reconnecter({
      code: creation.room!.code, playerId: 1, sessionToken: creation.sessionToken,
    });
    expect(rep.error).toBe('Game already finished');
  });

  it('refuse la reconnexion sur une place vide du salon', async () => {
    const client = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(client, 'room:create',
      { playerName: 'Seul', gender: 'M' });
    // Un jeton est emis pour la place 2 alors que personne ne l'occupe.
    const jetonPlace2 = roomModel.issueSessionToken(creation.room!.id, 2);
    const { rep } = await reconnecter({
      code: creation.room!.code, playerId: 2, sessionToken: jetonPlace2,
    });
    expect(rep.error).toBe('Player slot not found in room');
  });
});

describe('Reconnexion acceptee avec le bon jeton', () => {
  let rep: RoomResponse;
  let reglages: RoomSettingsInfo | null;
  let notificationPartenaire: { playerId: 1 | 2; playerName: string } | null;

  beforeAll(async () => {
    const client = await connecter(serveur);
    const attenteReglages = attendrePeutEtre<RoomSettingsInfo>(client, 'room:settings', 3000);
    const attenteNotif = attendrePeutEtre<{ playerId: 1 | 2; playerName: string }>(
      invite, 'room:player-joined', 3000);
    rep = await emettreAvecAck<RoomResponse>(client, 'room:reconnect',
      { code: salon.code, playerId: 1, sessionToken: jetonHote });
    reglages = await attenteReglages;
    notificationPartenaire = await attenteNotif;
  });

  it('accepte la reconnexion', () => {
    expect(rep.success).toBe(true);
  });

  it('rend le salon et le numero du joueur', () => {
    expect(rep.playerId).toBe(1);
    expect(rep.room!.code).toBe(salon.code);
  });

  it('ne reemet pas de nouveau jeton', () => {
    expect(rep.sessionToken).toBeUndefined();
  });

  it('renvoie le recap des reglages du salon', () => {
    expect(reglages).not.toBeNull();
    expect(reglages!.gameMode).toBe('duel');
  });

  it('previent le partenaire du retour', () => {
    expect(notificationPartenaire).toMatchObject({ playerId: 1, playerName: 'Alice' });
  });

  it('le jeton reste valable pour une seconde reconnexion', async () => {
    const { rep: seconde } = await reconnecter({
      code: salon.code, playerId: 1, sessionToken: jetonHote,
    });
    expect(seconde.success).toBe(true);
  });

  it('le joueur 2 peut aussi revenir avec son propre jeton', async () => {
    const { rep: retourInvite } = await reconnecter({
      code: salon.code, playerId: 2, sessionToken: jetonInvite,
    });
    expect(retourInvite.success).toBe(true);
    expect(retourInvite.playerId).toBe(2);
  });

  it('rafraichit l\'horodatage d\'activite du salon', () => {
    expect(roomModel.getRoomByCode(salon.code)?.last_activity).toBeTruthy();
  });
});

describe('Jetons emis par le serveur', () => {
  it('les deux joueurs ont recu des jetons differents', () => {
    expect(jetonHote).not.toBe(jetonInvite);
  });

  it('le jeton ne contient pas le code du salon', () => {
    expect(jetonHote).not.toContain(salon.code);
  });

  it('le jeton est suffisamment long pour ne pas se deviner', () => {
    expect(jetonHote.length).toBeGreaterThanOrEqual(30);
  });

  it('le jeton n\'utilise que des caracteres sans echappement', () => {
    expect(jetonHote).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('le jeton est reellement verifie cote base', () => {
    expect(roomModel.verifySessionToken(salon.id, 1, jetonHote)).toBe(true);
    expect(roomModel.verifySessionToken(salon.id, 1, jetonHote.slice(0, -2))).toBe(false);
  });
});
