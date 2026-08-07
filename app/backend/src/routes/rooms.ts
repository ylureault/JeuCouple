import { Router } from 'express';
import { getRoomByCode } from '../models/room.js';

/**
 * Consultation publique et minimale d'un salon.
 *
 * Elle existe pour que le client puisse dire la verite AVANT d'agir :
 *  - ecran Rejoindre : distinguer "aucune partie avec ce code" de "partie deja
 *    complete", au lieu d'un unique message fourre-tout ;
 *  - /salon/:code ouvert depuis un lien perime : afficher "cette partie
 *    n'existe plus" plutot qu'un ecran noir et muet.
 *
 * Elle ne renvoie AUCUNE donnee personnelle (ni prenoms, ni jetons) : juste de
 * quoi choisir le bon message. Le socket reste seul juge de l'entree reelle.
 */
const router = Router();

// Frein simple a l'enumeration de codes, dans le meme esprit que le rate limit
// du room:join cote socket.
const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

function allow(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_PER_WINDOW) return false;
  entry.count++;
  return true;
}

router.get('/:code', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!allow(ip)) {
    res.status(429).json({ error: 'Trop de requetes' });
    return;
  }

  const code = String(req.params.code || '').trim();
  if (!/^\d{4,8}$/.test(code)) {
    res.json({ exists: false, status: null, full: false, joinable: false });
    return;
  }

  const room = getRoomByCode(code);

  // Un salon dont l'hote est parti est traite comme inexistant : c'est
  // exactement ce qu'il vaut pour un joueur qui arrive.
  if (!room || !room.player1_name) {
    res.json({ exists: false, status: null, full: false, joinable: false });
    return;
  }

  const full = !!room.player2_name;
  res.json({
    exists: true,
    status: room.status,
    full,
    joinable: room.status === 'waiting' && !full
  });
});

export default router;
