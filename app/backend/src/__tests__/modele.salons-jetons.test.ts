import { db, initDatabase } from '../database.js';
import * as roomModel from '../models/room.js';

/**
 * Salons et jetons de session.
 *
 * Le code de salon est public : il se dicte a voix haute. Ce n'est donc PAS lui
 * qui authentifie un joueur — c'est le jeton de session remis a la creation et
 * au join, exige a la reconnexion (constat Secu 4 : connaitre un code suffisait
 * a s'asseoir dans le fauteuil de quelqu'un).
 */

describe('Codes de salon', () => {
  beforeAll(() => {
    initDatabase();
  });

  it('cree un salon avec un code de six chiffres', () => {
    const room = roomModel.createRoom('Alice', 'F');
    expect(room.code).toMatch(/^\d{6}$/);
  });

  it('enregistre le nom et le genre de l\'hote', () => {
    const room = roomModel.createRoom('Bob', 'M');
    expect(room.player1_name).toBe('Bob');
    expect(room.player1_gender).toBe('M');
  });

  it('laisse la place du second joueur libre', () => {
    const room = roomModel.createRoom('Chloe', 'F');
    expect(room.player2_name).toBeNull();
    expect(room.player2_gender).toBeNull();
  });

  it('demarre en attente', () => {
    expect(roomModel.createRoom('Dan', 'M').status).toBe('waiting');
  });

  it('n\'attribue aucun jeton avant emission explicite', () => {
    const room = roomModel.createRoom('Eve', 'F');
    const row = db.prepare('SELECT player1_token, player2_token FROM rooms WHERE id = ?')
      .get(room.id) as { player1_token: string | null; player2_token: string | null };
    expect([row.player1_token, row.player2_token]).toEqual([null, null]);
  });

  describe('sur un grand nombre de tirages', () => {
    const codes: string[] = [];

    beforeAll(() => {
      for (let i = 0; i < 400; i++) codes.push(roomModel.createRoom(`J${i}`, 'M').code);
    });

    it('tous les codes font exactement six caracteres', () => {
      expect(codes.filter(c => c.length !== 6)).toEqual([]);
    });

    it('tous les codes ne contiennent que des chiffres', () => {
      expect(codes.filter(c => !/^\d+$/.test(c))).toEqual([]);
    });

    it('aucun code n\'est reutilise', () => {
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('les codes sont completes par des zeros a gauche quand la valeur est petite', () => {
      // Sur 400 tirages, la probabilite de n'avoir aucun code < 100000 est nulle.
      expect(codes.some(c => c.startsWith('0'))).toBe(true);
    });

    it('les codes ne sont pas tires dans un ordre previsible', () => {
      const croissant = [...codes].sort();
      expect(codes).not.toEqual(croissant);
    });

    it('couvre une large plage de valeurs', () => {
      const valeurs = codes.map(Number);
      expect(Math.max(...valeurs) - Math.min(...valeurs)).toBeGreaterThan(500_000);
    });
  });

  describe('recherche par code', () => {
    it('retrouve un salon par son code', () => {
      const room = roomModel.createRoom('Fanny', 'F');
      expect(roomModel.getRoomByCode(room.code)?.id).toBe(room.id);
    });

    it('rend undefined pour un code inconnu', () => {
      expect(roomModel.getRoomByCode('000000')).toBeUndefined();
    });

    it('rend undefined pour un code au mauvais format', () => {
      expect(roomModel.getRoomByCode('abc')).toBeUndefined();
    });

    it('rend undefined pour un code vide', () => {
      expect(roomModel.getRoomByCode('')).toBeUndefined();
    });

    it('retrouve un salon par son identifiant', () => {
      const room = roomModel.createRoom('Gaspard', 'M');
      expect(roomModel.getRoomById(room.id)?.code).toBe(room.code);
    });

    it('rend undefined pour un identifiant inconnu', () => {
      expect(roomModel.getRoomById(-5)).toBeUndefined();
    });
  });
});

describe('Cycle de vie d\'un salon', () => {
  beforeAll(() => {
    initDatabase();
  });

  it('accepte un second joueur', () => {
    const room = roomModel.createRoom('Hote', 'F');
    const rejoint = roomModel.joinRoom(room.code, 'Invite', 'M');
    expect(rejoint?.player2_name).toBe('Invite');
    expect(rejoint?.player2_gender).toBe('M');
  });

  it('refuse un troisieme joueur : le salon est plein', () => {
    const room = roomModel.createRoom('Hote2', 'F');
    roomModel.joinRoom(room.code, 'Invite', 'M');
    expect(roomModel.joinRoom(room.code, 'Intrus', 'M')).toBeNull();
  });

  it('refuse de rejoindre un code inconnu', () => {
    expect(roomModel.joinRoom('999999', 'Invite', 'M')).toBeNull();
  });

  it('refuse de rejoindre une partie deja lancee', () => {
    const room = roomModel.createRoom('Hote3', 'F');
    roomModel.updateRoomStatus(room.id, 'playing');
    expect(roomModel.joinRoom(room.code, 'Invite', 'M')).toBeNull();
  });

  it('refuse de rejoindre une partie terminee', () => {
    const room = roomModel.createRoom('Hote4', 'F');
    roomModel.updateRoomStatus(room.id, 'finished');
    expect(roomModel.joinRoom(room.code, 'Invite', 'M')).toBeNull();
  });

  it('libere la place quand un joueur quitte le lobby', () => {
    const room = roomModel.createRoom('Hote5', 'F');
    roomModel.joinRoom(room.code, 'Invite', 'M');
    roomModel.removePlayerFromRoom(room.id, 2);
    const apres = roomModel.getRoomById(room.id)!;
    expect([apres.player2_name, apres.player2_gender]).toEqual([null, null]);
  });

  it('une place liberee peut etre reprise par quelqu\'un d\'autre', () => {
    const room = roomModel.createRoom('Hote6', 'F');
    roomModel.joinRoom(room.code, 'Premier', 'M');
    roomModel.removePlayerFromRoom(room.id, 2);
    expect(roomModel.joinRoom(room.code, 'Second', 'M')?.player2_name).toBe('Second');
  });

  it('liberer la place de l\'hote n\'efface pas celle de l\'invite', () => {
    const room = roomModel.createRoom('Hote7', 'F');
    roomModel.joinRoom(room.code, 'Invite', 'M');
    roomModel.removePlayerFromRoom(room.id, 1);
    const apres = roomModel.getRoomById(room.id)!;
    expect(apres.player1_name).toBeNull();
    expect(apres.player2_name).toBe('Invite');
  });

  it('change le statut du salon', () => {
    const room = roomModel.createRoom('Hote8', 'F');
    roomModel.updateRoomStatus(room.id, 'playing');
    expect(roomModel.getRoomById(room.id)?.status).toBe('playing');
    roomModel.updateRoomStatus(room.id, 'finished');
    expect(roomModel.getRoomById(room.id)?.status).toBe('finished');
  });

  it('supprime un salon', () => {
    const room = roomModel.createRoom('Hote9', 'F');
    roomModel.deleteRoom(room.id);
    expect(roomModel.getRoomById(room.id)).toBeUndefined();
  });

  it('compte les salons ouverts ou en cours, pas les termines', () => {
    const avant = roomModel.getActiveRoomsCount();
    const room = roomModel.createRoom('Hote10', 'F');
    expect(roomModel.getActiveRoomsCount()).toBe(avant + 1);
    roomModel.updateRoomStatus(room.id, 'finished');
    expect(roomModel.getActiveRoomsCount()).toBe(avant);
  });

  it('met a jour l\'horodatage d\'activite sans rien casser', () => {
    const room = roomModel.createRoom('Hote11', 'F');
    roomModel.updateRoomActivity(room.id);
    expect(roomModel.getRoomById(room.id)?.last_activity).toBeTruthy();
  });

  it('liste tous les salons crees', () => {
    const room = roomModel.createRoom('Hote12', 'F');
    expect(roomModel.getAllRooms().some(r => r.id === room.id)).toBe(true);
  });
});

describe('Jetons de session', () => {
  beforeAll(() => {
    initDatabase();
  });

  describe('emission', () => {
    it('rend un jeton non vide', () => {
      const room = roomModel.createRoom('Ida', 'F');
      expect(roomModel.issueSessionToken(room.id, 1).length).toBeGreaterThan(20);
    });

    it('emet un jeton en base64url, sans caractere a echapper', () => {
      const room = roomModel.createRoom('Jo', 'M');
      expect(roomModel.issueSessionToken(room.id, 1)).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('emet deux jetons differents pour les deux joueurs du meme salon', () => {
      const room = roomModel.createRoom('Kim', 'F');
      const t1 = roomModel.issueSessionToken(room.id, 1);
      const t2 = roomModel.issueSessionToken(room.id, 2);
      expect(t1).not.toBe(t2);
    });

    it('n\'emet jamais deux fois le meme jeton', () => {
      const jetons = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const room = roomModel.createRoom(`L${i}`, 'M');
        jetons.add(roomModel.issueSessionToken(room.id, 1));
      }
      expect(jetons.size).toBe(200);
    });

    it('le jeton ne derive pas du code du salon', () => {
      const room = roomModel.createRoom('Manon', 'F');
      const jeton = roomModel.issueSessionToken(room.id, 1);
      expect(jeton).not.toContain(room.code);
    });

    it('reemettre un jeton invalide le precedent', () => {
      const room = roomModel.createRoom('Noe', 'M');
      const ancien = roomModel.issueSessionToken(room.id, 1);
      const nouveau = roomModel.issueSessionToken(room.id, 1);
      expect(roomModel.verifySessionToken(room.id, 1, ancien)).toBe(false);
      expect(roomModel.verifySessionToken(room.id, 1, nouveau)).toBe(true);
    });

    it('emettre le jeton du joueur 2 ne touche pas celui du joueur 1', () => {
      const room = roomModel.createRoom('Olga', 'F');
      const t1 = roomModel.issueSessionToken(room.id, 1);
      roomModel.issueSessionToken(room.id, 2);
      expect(roomModel.verifySessionToken(room.id, 1, t1)).toBe(true);
    });
  });

  describe('verification', () => {
    let roomId: number;
    let jeton1: string;
    let jeton2: string;

    beforeAll(() => {
      const room = roomModel.createRoom('Paul', 'M');
      roomModel.joinRoom(room.code, 'Quentin', 'M');
      roomId = room.id;
      jeton1 = roomModel.issueSessionToken(room.id, 1);
      jeton2 = roomModel.issueSessionToken(room.id, 2);
    });

    it('accepte le bon jeton du joueur 1', () => {
      expect(roomModel.verifySessionToken(roomId, 1, jeton1)).toBe(true);
    });

    it('accepte le bon jeton du joueur 2', () => {
      expect(roomModel.verifySessionToken(roomId, 2, jeton2)).toBe(true);
    });

    it('refuse le jeton du joueur 1 presente pour la place du joueur 2', () => {
      expect(roomModel.verifySessionToken(roomId, 2, jeton1)).toBe(false);
    });

    it('refuse le jeton du joueur 2 presente pour la place du joueur 1', () => {
      expect(roomModel.verifySessionToken(roomId, 1, jeton2)).toBe(false);
    });

    it('refuse une absence de jeton', () => {
      expect(roomModel.verifySessionToken(roomId, 1, undefined)).toBe(false);
    });

    it('refuse un jeton vide', () => {
      expect(roomModel.verifySessionToken(roomId, 1, '')).toBe(false);
    });

    it('refuse un jeton tronque', () => {
      expect(roomModel.verifySessionToken(roomId, 1, jeton1.slice(0, -1))).toBe(false);
    });

    it('refuse un jeton allonge', () => {
      expect(roomModel.verifySessionToken(roomId, 1, jeton1 + 'A')).toBe(false);
    });

    it('refuse un jeton dont un seul caractere differe', () => {
      const altere = (jeton1[0] === 'A' ? 'B' : 'A') + jeton1.slice(1);
      expect(roomModel.verifySessionToken(roomId, 1, altere)).toBe(false);
    });

    it('refuse un jeton valide mais emis pour un autre salon', () => {
      const autre = roomModel.createRoom('Rita', 'F');
      const jetonAutre = roomModel.issueSessionToken(autre.id, 1);
      expect(roomModel.verifySessionToken(roomId, 1, jetonAutre)).toBe(false);
    });

    it('refuse toute verification sur un salon sans jeton emis', () => {
      const vierge = roomModel.createRoom('Sam', 'M');
      expect(roomModel.verifySessionToken(vierge.id, 1, jeton1)).toBe(false);
    });

    it('refuse toute verification sur un salon inexistant', () => {
      expect(roomModel.verifySessionToken(-1, 1, jeton1)).toBe(false);
    });

    it('refuse un jeton reduit a un espace', () => {
      expect(roomModel.verifySessionToken(roomId, 1, ' ')).toBe(false);
    });

    it('ne fuit pas le jeton attendu en cas d\'echec', () => {
      // La verification rend un booleen, jamais la valeur stockee.
      expect(typeof roomModel.verifySessionToken(roomId, 1, 'mauvais')).toBe('boolean');
    });

    it('reste valide apres un changement de statut du salon', () => {
      roomModel.updateRoomStatus(roomId, 'playing');
      expect(roomModel.verifySessionToken(roomId, 1, jeton1)).toBe(true);
    });

    it('compare en temps constant : des longueurs differentes ne plantent pas', () => {
      for (const faux of ['a', 'ab', 'x'.repeat(100), '0'.repeat(32)]) {
        expect(() => roomModel.verifySessionToken(roomId, 1, faux)).not.toThrow();
        expect(roomModel.verifySessionToken(roomId, 1, faux)).toBe(false);
      }
    });

    it('accepte le meme jeton plusieurs fois de suite (reconnexions repetees)', () => {
      for (let i = 0; i < 5; i++) {
        expect(roomModel.verifySessionToken(roomId, 1, jeton1)).toBe(true);
      }
    });
  });
});
