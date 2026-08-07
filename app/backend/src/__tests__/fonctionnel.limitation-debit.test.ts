import { initDatabase } from '../database.js';
import type { Room, RoomResponse } from '../types.js';
import {
  demarrerServeur, connecter, emettreAvecAck, enregistrer, pause,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * Limitation de debit (audit securite).
 *
 * Style impose par le coach : limites genereuses, rejet SILENCIEUX sur les
 * evenements d'ambiance (on ne colle pas un message punitif en pleine partie),
 * message explicite sur les evenements qui structurent la partie (join,
 * reconnexion), ou l'utilisateur a besoin de comprendre pourquoi ca bloque.
 *
 * Cette suite sature volontairement les compteurs : elle est isolee dans son
 * propre fichier pour ne pas gener les autres (les compteurs sont partages par
 * adresse IP pour toute la duree d'un fichier de test).
 */

const PORT = 3149;
let serveur: HarnaisServeur;
let hote: ClientSocket;
let invite: ClientSocket;
let salon: Room;

beforeAll(async () => {
  initDatabase();
  serveur = await demarrerServeur(PORT);

  hote = await connecter(serveur);
  const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create',
    { playerName: 'Alice', gender: 'F' });
  salon = creation.room!;

  invite = await connecter(serveur);
  await emettreAvecAck<RoomResponse>(invite, 'room:join',
    { code: salon.code, playerName: 'Bob', gender: 'M' });
}, 30_000);

afterAll(async () => {
  await serveur.fermer();
});

/** Emet N fois un evenement et compte ce que le partenaire recoit reellement. */
async function saturer(
  emetteur: ClientSocket, recepteur: ClientSocket,
  evenement: string, envois: number, charge?: unknown,
): Promise<number> {
  const recus = enregistrer(recepteur, evenement);
  for (let i = 0; i < envois; i++) {
    if (charge === undefined) emetteur.emit(evenement);
    else emetteur.emit(evenement, typeof charge === 'function' ? (charge as (n: number) => unknown)(i) : charge);
  }
  await pause(900);
  recepteur.off(evenement);
  return recus.length;
}

describe('Evenements d\'ambiance : rejet silencieux', () => {
  it('laisse passer dix vibrations puis coupe silencieusement', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Buzzeur', gender: 'M' });
    const recus = await saturer(client, client, 'game:buzz', 18);
    expect(recus).toBe(10);
  });

  it('laisse passer trente reactions emoji puis coupe', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Reacteur', gender: 'M' });
    const recus = await saturer(client, client, 'game:reaction', 45, { emoji: '❤️' });
    expect(recus).toBe(30);
  });

  it('laisse passer quinze reactions sonores puis coupe', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Sonore', gender: 'M' });
    const recus = await saturer(client, client, 'game:sound-reaction', 25, { reactionId: 'klaxon' });
    expect(recus).toBe(15);
  });

  it('laisse passer vingt messages de chat puis coupe', async () => {
    const client = await connecter(serveur);
    const creation = await emettreAvecAck<RoomResponse>(client, 'room:create',
      { playerName: 'Bavard', gender: 'M' });
    expect(creation.success).toBe(true);
    const recus = await saturer(client, client, 'lobby:chat', 30, (i: number) => ({ message: `message ${i}` }));
    expect(recus).toBe(20);
  });

  it('laisse passer vingt messages predefinis puis coupe', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Rapide', gender: 'M' });
    const recus = await saturer(client, client, 'game:quick-message', 28, { messageId: 'yesss' });
    expect(recus).toBe(20);
  });

  it('n\'emet jamais de message d\'erreur au joueur limite', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Silencieux', gender: 'M' });
    const erreurs = enregistrer(client, 'error');
    for (let i = 0; i < 30; i++) client.emit('game:buzz');
    await pause(600);
    expect(erreurs).toEqual([]);
  });

  it('chaque socket a son propre compteur', async () => {
    const a = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(a, 'room:create', { playerName: 'A', gender: 'M' });
    for (let i = 0; i < 15; i++) a.emit('game:buzz');
    await pause(400);

    const b = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(b, 'room:create', { playerName: 'B', gender: 'M' });
    const recus = await saturer(b, b, 'game:buzz', 5);
    expect(recus).toBe(5);
  });
});

describe('Validation du contenu, independante du debit', () => {
  it('ignore un emoji de reaction hors catalogue', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Bidon', gender: 'M' });
    const recus = await saturer(client, client, 'game:reaction', 3, { emoji: '💀☠️' });
    expect(recus).toBe(0);
  });

  it('ignore une reaction sonore inconnue', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Bidon2', gender: 'M' });
    const recus = await saturer(client, client, 'game:sound-reaction', 3, { reactionId: 'tronconneuse' });
    expect(recus).toBe(0);
  });

  it('ignore un message predefini inconnu', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Bidon3', gender: 'M' });
    const recus = await saturer(client, client, 'game:quick-message', 3, { messageId: 'jamais_vu' });
    expect(recus).toBe(0);
  });

  it('ignore un message de chat vide ou blanc', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Vide', gender: 'M' });
    const recus = await saturer(client, client, 'lobby:chat', 3, { message: '   ' });
    expect(recus).toBe(0);
  });

  it('tronque un message de chat trop long a 200 caracteres', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Logorrhee', gender: 'M' });
    const recus = enregistrer<{ message: string; playerName: string }>(client, 'lobby:chat');
    client.emit('lobby:chat', { message: 'z'.repeat(500) });
    await pause(600);
    expect(recus[0].message.length).toBe(200);
  });

  it('accompagne chaque message de chat du nom de son auteur', async () => {
    const client = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(client, 'room:create', { playerName: 'Signataire', gender: 'M' });
    const recus = enregistrer<{ message: string; playerName: string; playerId: 1 | 2 }>(client, 'lobby:chat');
    client.emit('lobby:chat', { message: 'coucou' });
    await pause(600);
    expect(recus[0]).toMatchObject({ message: 'coucou', playerName: 'Signataire', playerId: 1 });
  });
});

describe('Limitation des reconnexions : message explicite', () => {
  it('coupe apres vingt tentatives et le dit au joueur', async () => {
    const client = await connecter(serveur);
    const erreurs: string[] = [];
    for (let i = 0; i < 24; i++) {
      const rep = await emettreAvecAck<RoomResponse>(client, 'room:reconnect',
        { code: '000000', playerId: 1, sessionToken: 'x' });
      erreurs.push(rep.error!);
    }
    expect(erreurs[0]).toBe('Room not found');
    expect(erreurs[19]).toBe('Room not found');
    expect(erreurs[20]).toBe('Trop de tentatives, reessaie dans une minute');
    expect(erreurs[23]).toBe('Trop de tentatives, reessaie dans une minute');
  }, 40_000);
});

describe('Limitation des tentatives de join : frein a l\'enumeration des codes', () => {
  // Ce bloc SATURE le compteur de join pour toute la suite : il est declare en
  // dernier, apres les scenarios qui ont besoin de rejoindre un salon.
  it('coupe apres quinze tentatives et le dit au joueur', async () => {
    const client = await connecter(serveur);
    const erreurs: string[] = [];
    for (let i = 0; i < 20; i++) {
      const rep = await emettreAvecAck<RoomResponse>(client, 'room:join',
        { code: '000000', playerName: 'Curieux', gender: 'M' });
      erreurs.push(rep.error!);
    }
    // Une unite a deja ete consommee par le join legitime du montage.
    const limitees = erreurs.filter(e => e === 'Trop de tentatives, reessaie dans une minute');
    const refusees = erreurs.filter(e => e === 'Room not found or full');

    expect(refusees.length).toBe(14);
    expect(limitees.length).toBe(6);
    expect(erreurs[0]).toBe('Room not found or full');
    expect(erreurs[19]).toBe('Trop de tentatives, reessaie dans une minute');
  }, 40_000);

  it('un code de salon valide est refuse lui aussi une fois le compteur sature', async () => {
    const client = await connecter(serveur);
    const rep = await emettreAvecAck<RoomResponse>(client, 'room:join',
      { code: salon.code, playerName: 'Tard', gender: 'F' });
    expect(rep.error).toBe('Trop de tentatives, reessaie dans une minute');
  });

  it('la creation de salon, elle, reste possible', async () => {
    const client = await connecter(serveur);
    const rep = await emettreAvecAck<RoomResponse>(client, 'room:create',
      { playerName: 'Createur', gender: 'M' });
    expect(rep.success).toBe(true);
  });
});
