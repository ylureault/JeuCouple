import type { ModeContext } from '../../services/gameModes.js';

/**
 * Fabrique un ModeContext complet a partir de quelques champs.
 * Les tests de modes decrivent ainsi uniquement ce qui les interesse, sans
 * dupliquer la structure attendue par afterRound().
 */
export function ctx(partial: Partial<ModeContext> = {}): ModeContext {
  return {
    roomCode: '123456',
    questionIndex: 0,
    loadedQuestions: 10,
    scores: { player1: 0, player2: 0 },
    roundWinner: null,
    roundWinners: [],
    roundAgreements: [],
    acquiredPalier: 0,
    settings: {
      questionCount: 10,
      categories: [],
      questionTypes: [],
    },
    ...partial,
  };
}

/** Suite de N booleens identiques (series d'accords / de desaccords). */
export function repeat<T>(value: T, n: number): T[] {
  return Array.from({ length: n }, () => value);
}
