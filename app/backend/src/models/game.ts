import { db } from '../database.js';
import type { Game, Answer } from '../types.js';

export function createGame(roomId: number): Game {
  const result = db.prepare(`
    INSERT INTO games (room_id, score_player1, score_player2)
    VALUES (?, 0, 0)
  `).run(roomId);

  return getGameById(result.lastInsertRowid as number)!;
}

export function getGameById(id: number): Game | undefined {
  return db.prepare('SELECT * FROM games WHERE id = ?').get(id) as Game | undefined;
}

export function getCurrentGameForRoom(roomId: number): Game | undefined {
  return db.prepare(`
    SELECT * FROM games
    WHERE room_id = ? AND finished_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `).get(roomId) as Game | undefined;
}

export function finishGame(id: number): void {
  db.prepare(`
    UPDATE games
    SET finished_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

export function updateGameScore(id: number, player1Score: number, player2Score: number): void {
  db.prepare(`
    UPDATE games
    SET score_player1 = ?, score_player2 = ?
    WHERE id = ?
  `).run(player1Score, player2Score, id);
}

export function saveAnswer(gameId: number, questionId: number, playerId: 1 | 2, answer: string): Answer {
  const result = db.prepare(`
    INSERT INTO answers (game_id, question_id, player_id, answer)
    VALUES (?, ?, ?, ?)
  `).run(gameId, questionId, playerId, answer);

  return db.prepare('SELECT * FROM answers WHERE id = ?').get(result.lastInsertRowid) as Answer;
}

export function getAnswersForQuestion(gameId: number, questionId: number): Answer[] {
  return db.prepare(`
    SELECT * FROM answers
    WHERE game_id = ? AND question_id = ?
  `).all(gameId, questionId) as Answer[];
}

export function getAnswerByPlayer(gameId: number, questionId: number, playerId: 1 | 2): Answer | undefined {
  return db.prepare(`
    SELECT * FROM answers
    WHERE game_id = ? AND question_id = ? AND player_id = ?
  `).get(gameId, questionId, playerId) as Answer | undefined;
}

export function getTotalGames(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM games').get() as { count: number };
  return result.count;
}

export function getGameStats(gameId: number): { player1Correct: number; player2Correct: number } {
  // This would be more complex in real implementation
  // For now, return placeholder
  return { player1Correct: 0, player2Correct: 0 };
}

/**
 * Efface les reponses d'une partie terminee. Les reponses de type C sont des
 * confessions intimes : on ne les conserve pas en clair au-dela de la partie
 * (decision de l'audit croise coach en relations + cybersecurite).
 */
export function deleteAnswersForGame(gameId: number): number {
  return db.prepare('DELETE FROM answers WHERE game_id = ?').run(gameId).changes;
}
