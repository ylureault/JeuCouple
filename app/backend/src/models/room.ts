import { db } from '../database.js';
import type { Room, Gender } from '../types.js';

function generateCode(): string {
  // Generate 4-digit code (0000-9999)
  const code = Math.floor(Math.random() * 10000);
  return code.toString().padStart(4, '0');
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
