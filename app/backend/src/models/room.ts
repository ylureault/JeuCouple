import { db } from '../database.js';
import type { Room } from '../../../shared/types.js';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function createRoom(player1Name: string): Room {
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
    INSERT INTO rooms (code, player1_name, status)
    VALUES (?, ?, 'waiting')
  `).run(code, player1Name);

  return getRoomById(result.lastInsertRowid as number)!;
}

export function getRoomById(id: number): Room | undefined {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as Room | undefined;
}

export function getRoomByCode(code: string): Room | undefined {
  return db.prepare('SELECT * FROM rooms WHERE code = ?').get(code.toUpperCase()) as Room | undefined;
}

export function joinRoom(code: string, player2Name: string): Room | null {
  const room = getRoomByCode(code);

  if (!room) return null;
  if (room.player2_name) return null; // Room is full
  if (room.status !== 'waiting') return null;

  db.prepare(`
    UPDATE rooms
    SET player2_name = ?, last_activity = datetime('now')
    WHERE id = ?
  `).run(player2Name, room.id);

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
  const field = playerId === 1 ? 'player1_name' : 'player2_name';
  db.prepare(`
    UPDATE rooms
    SET ${field} = NULL, last_activity = datetime('now')
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
