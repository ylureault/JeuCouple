import { db } from '../database.js';
import crypto from 'crypto';
import type { Room, Gender } from '../types.js';

function generateCode(): string {
  // 6 chiffres tires de crypto (Math.random n'est pas un generateur sur).
  // Arbitrage de l'audit : le code reste numerique et dictable a voix haute,
  // l'authentification reelle repose sur le jeton de session, pas sur le code.
  const code = crypto.randomInt(0, 1_000_000);
  return code.toString().padStart(6, '0');
}

/**
 * Jeton de session secret remis a chaque joueur a la creation/au join, exige
 * au room:reconnect. Sans lui, n'importe qui connaissant un code de salon
 * pouvait s'asseoir dans le fauteuil d'un joueur (constat Secu 4).
 */
export function issueSessionToken(roomId: number, playerId: 1 | 2): string {
  const token = crypto.randomBytes(24).toString('base64url');
  const col = playerId === 1 ? 'player1_token' : 'player2_token';
  db.prepare(`UPDATE rooms SET ${col} = ? WHERE id = ?`).run(token, roomId);
  return token;
}

export function verifySessionToken(roomId: number, playerId: 1 | 2, token: string | undefined): boolean {
  if (!token) return false;
  const col = playerId === 1 ? 'player1_token' : 'player2_token';
  const row = db.prepare(`SELECT ${col} as t FROM rooms WHERE id = ?`).get(roomId) as { t: string | null } | undefined;
  if (!row?.t) return false;
  const a = Buffer.from(row.t);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createRoom(player1Name: string, player1Gender: Gender): Room {
  let code: string;
  let attempts = 0;

  // Generate unique code
  do {
    code = generateCode();
    attempts++;
    if (attempts > 100) {
      throw new Error('Failed to generate unique room code');
    }
  } while (getRoomByCode(code));

  const result = db.prepare(`
    INSERT INTO rooms (code, player1_name, player1_gender, status)
    VALUES (?, ?, ?, 'waiting')
  `).run(code, player1Name, player1Gender);

  return getRoomById(result.lastInsertRowid as number)!;
}

export function getRoomById(id: number): Room | undefined {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as Room | undefined;
}

export function getRoomByCode(code: string): Room | undefined {
  return db.prepare('SELECT * FROM rooms WHERE code = ?').get(code.toUpperCase()) as Room | undefined;
}

export function joinRoom(code: string, player2Name: string, player2Gender: Gender): Room | null {
  const room = getRoomByCode(code);

  if (!room) return null;
  // SALON FANTOME (bug B6) : quand l'hote quittait le lobby, son slot etait
  // vide mais la ligne restait en statut 'waiting'. Le suivant a taper ce code
  // s'y asseyait en JOUEUR 2, face a un JOUEUR 1 vide, et attendait un
  // partenaire qui ne viendrait jamais — pendant que le vrai 2e joueur se
  // voyait refuser l'entree (salon desormais complet). Un salon sans hote
  // n'est plus un salon : on refuse, et le joueur cree sa propre partie ou il
  // sera JOUEUR 1.
  if (!room.player1_name) return null;
  if (room.player2_name) return null; // Room is full
  if (room.status !== 'waiting') return null;

  db.prepare(`
    UPDATE rooms
    SET player2_name = ?, player2_gender = ?, last_activity = datetime('now')
    WHERE id = ?
  `).run(player2Name, player2Gender, room.id);

  return getRoomById(room.id)!;
}

export function updateRoomStatus(id: number, status: Room['status']): void {
  db.prepare(`
    UPDATE rooms
    SET status = ?, last_activity = datetime('now')
    WHERE id = ?
  `).run(status, id);
}

export function removePlayerFromRoom(id: number, playerId: 1 | 2): void {
  const nameField = playerId === 1 ? 'player1_name' : 'player2_name';
  const genderField = playerId === 1 ? 'player1_gender' : 'player2_gender';
  db.prepare(`
    UPDATE rooms
    SET ${nameField} = NULL, ${genderField} = NULL, last_activity = datetime('now')
    WHERE id = ?
  `).run(id);
}

export function updateRoomActivity(id: number): void {
  db.prepare(`
    UPDATE rooms
    SET last_activity = datetime('now')
    WHERE id = ?
  `).run(id);
}

export function getAllRooms(): Room[] {
  return db.prepare('SELECT * FROM rooms ORDER BY created_at DESC').all() as Room[];
}

export function deleteRoom(id: number): void {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
}

export function getActiveRoomsCount(): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM rooms
    WHERE status IN ('waiting', 'playing')
  `).get() as { count: number };
  return result.count;
}
