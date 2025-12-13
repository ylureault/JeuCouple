import { Server, Socket } from 'socket.io';
import type {
  Room,
  Question,
  QuestionType,
  ServerToClientEvents,
  ClientToServerEvents,
  GameRevealData,
  GameFinishedData,
  CategoryScore
} from '../types.js';
import * as roomModel from '../models/room.js';
import * as gameModel from '../models/game.js';
import * as questionModel from '../models/question.js';

interface AnswerData {
  answer1?: string;
  answer2?: string;
  time1?: number;  // timestamp when player 1 answered
  time2?: number;  // timestamp when player 2 answered
}

interface GamificationState {
  streak1: number;
  streak2: number;
  maxStreak1: number;
  maxStreak2: number;
  speedBonusTotal1: number;
  speedBonusTotal2: number;
  categoryStats: Map<string, { points1: number; points2: number; questions: number }>;
  perfectMatches: number;
}

interface GameState {
  gameId: number;
  roomId: number;
  questions: Question[];
  currentQuestionIndex: number;
  answers: Map<number, AnswerData>;
  scores: { player1: number; player2: number };
  timer: NodeJS.Timeout | null;
  phase: 'question' | 'waiting' | 'reveal';
  questionStartTime: number;
  gamification: GamificationState;
}

interface PlayerConnection {
  socket: Socket;
  roomCode: string;
  playerId: 1 | 2;
}

const activeGames = new Map<string, GameState>();
const playerConnections = new Map<string, PlayerConnection>();

// Constants for gamification
const BASE_POINTS = 100;
const SPEED_BONUS_THRESHOLD_FAST = 5;  // seconds for 25% bonus
const SPEED_BONUS_THRESHOLD_MEDIUM = 10;  // seconds for 10% bonus
const SPEED_BONUS_FAST = 0.25;  // 25% bonus
const SPEED_BONUS_MEDIUM = 0.10;  // 10% bonus
const STREAK_MULTIPLIERS: Record<number, number> = {
  2: 1.2,   // 2 streak = 20% bonus
  3: 1.5,   // 3 streak = 50% bonus
  4: 1.75,  // 4 streak = 75% bonus
  5: 2.0,   // 5+ streak = 100% bonus (2x)
};
const TYPE_C_THOUGHTFUL_BONUS = 50;  // Bonus for answers > 20 chars

export function setupSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Create room
    socket.on('room:create', (data, callback) => {
      try {
        const room = roomModel.createRoom(data.playerName);
        socket.join(room.code);

        playerConnections.set(socket.id, {
          socket,
          roomCode: room.code,
          playerId: 1
        });

        callback({ success: true, room, playerId: 1 });
      } catch (error) {
        callback({ success: false, error: 'Failed to create room' });
      }
    });

    // Join room
    socket.on('room:join', (data, callback) => {
      try {
        const room = roomModel.joinRoom(data.code, data.playerName);

        if (!room) {
          callback({ success: false, error: 'Room not found or full' });
          return;
        }

        socket.join(room.code);

        playerConnections.set(socket.id, {
          socket,
          roomCode: room.code,
          playerId: 2
        });

        // Notify player 1
        socket.to(room.code).emit('room:player-joined', {
          playerName: data.playerName,
          playerId: 2
        });

        callback({ success: true, room, playerId: 2 });
      } catch (error) {
        callback({ success: false, error: 'Failed to join room' });
      }
    });

    // Reconnect to room
    socket.on('room:reconnect', (data, callback) => {
      try {
        const room = roomModel.getRoomByCode(data.code);

        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        socket.join(room.code);

        playerConnections.set(socket.id, {
          socket,
          roomCode: room.code,
          playerId: data.playerId
        });

        roomModel.updateRoomActivity(room.id);

        callback({ success: true, room, playerId: data.playerId });

        // Notify the other player
        socket.to(room.code).emit('room:player-joined', {
          playerName: data.playerId === 1 ? room.player1_name! : room.player2_name!,
          playerId: data.playerId
        });
      } catch (error) {
        callback({ success: false, error: 'Failed to reconnect' });
      }
    });

    // Leave room
    socket.on('room:leave', () => {
      handleDisconnect(socket, io);
    });

    // Start game
    socket.on('game:start', (callback) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const room = roomModel.getRoomByCode(connection.roomCode);
      if (!room || !room.player1_name || !room.player2_name) {
        callback({ success: false, error: 'Room not ready' });
        return;
      }

      if (connection.playerId !== 1) {
        callback({ success: false, error: 'Only host can start the game' });
        return;
      }

      // Get random questions
      const questions = questionModel.getRandomQuestions(10);
      if (questions.length === 0) {
        callback({ success: false, error: 'No questions available' });
        return;
      }

      // Create game
      const game = gameModel.createGame(room.id);
      roomModel.updateRoomStatus(room.id, 'playing');

      // Initialize game state with gamification
      const gameState: GameState = {
        gameId: game.id,
        roomId: room.id,
        questions,
        currentQuestionIndex: 0,
        answers: new Map(),
        scores: { player1: 0, player2: 0 },
        timer: null,
        phase: 'question',
        questionStartTime: Date.now(),
        gamification: {
          streak1: 0,
          streak2: 0,
          maxStreak1: 0,
          maxStreak2: 0,
          speedBonusTotal1: 0,
          speedBonusTotal2: 0,
          categoryStats: new Map(),
          perfectMatches: 0
        }
      };

      activeGames.set(room.code, gameState);

      // Notify both players
      io.to(room.code).emit('game:started', { gameId: game.id });

      callback({ success: true });

      // Start first question after a short delay
      setTimeout(() => {
        sendQuestion(io, room.code, gameState);
      }, 2000);
    });

    // Answer question
    socket.on('game:answer', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      const gameState = activeGames.get(connection.roomCode);
      if (!gameState || gameState.phase !== 'question') return;

      const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
      const answerTime = Date.now();

      // Save answer with timestamp
      const questionAnswers = gameState.answers.get(currentQuestion.id) || {};
      if (connection.playerId === 1) {
        questionAnswers.answer1 = data.answer;
        questionAnswers.time1 = answerTime;
      } else {
        questionAnswers.answer2 = data.answer;
        questionAnswers.time2 = answerTime;
      }
      gameState.answers.set(currentQuestion.id, questionAnswers);

      // Save to database
      gameModel.saveAnswer(
        gameState.gameId,
        currentQuestion.id,
        connection.playerId,
        data.answer
      );

      // Notify other player that this player has answered
      socket.to(connection.roomCode).emit('game:player-answered', {
        playerId: connection.playerId
      });

      // Check if both players have answered
      if (questionAnswers.answer1 !== undefined && questionAnswers.answer2 !== undefined) {
        // Clear timer and reveal
        if (gameState.timer) {
          clearTimeout(gameState.timer);
          gameState.timer = null;
        }
        revealAnswers(io, connection.roomCode, gameState);
      }
    });

    // Restart game (same players, new questions)
    socket.on('game:restart', (callback) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const room = roomModel.getRoomByCode(connection.roomCode);
      if (!room) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      // Reset room status to waiting (ready to play again)
      roomModel.updateRoomStatus(room.id, 'waiting');

      // Clean up any existing game state for this room
      activeGames.delete(connection.roomCode);

      // Notify both players to go back to lobby
      io.to(connection.roomCode).emit('game:restarted');

      callback({ success: true });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      handleDisconnect(socket, io);
    });
  });
}

function handleDisconnect(
  socket: Socket,
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  const connection = playerConnections.get(socket.id);
  if (!connection) return;

  console.log('Player disconnected:', socket.id, 'from room:', connection.roomCode);

  // Notify other players
  socket.to(connection.roomCode).emit('room:player-left', {
    playerId: connection.playerId
  });

  // Clean up connection
  playerConnections.delete(socket.id);
  socket.leave(connection.roomCode);
}

function sendQuestion(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  gameState: GameState
) {
  const question = gameState.questions[gameState.currentQuestionIndex];
  gameState.phase = 'question';
  gameState.questionStartTime = Date.now();

  io.to(roomCode).emit('game:question', {
    question,
    questionNumber: gameState.currentQuestionIndex + 1,
    totalQuestions: gameState.questions.length
  });

  // Set timer
  gameState.timer = setTimeout(() => {
    // Time's up - reveal with whatever answers we have
    revealAnswers(io, roomCode, gameState);
  }, (question.timer + 3) * 1000); // Extra 3 seconds for network latency
}

function calculateSpeedBonus(answerTimeMs: number, questionStartTime: number): number {
  const seconds = (answerTimeMs - questionStartTime) / 1000;
  if (seconds <= SPEED_BONUS_THRESHOLD_FAST) {
    return SPEED_BONUS_FAST;
  } else if (seconds <= SPEED_BONUS_THRESHOLD_MEDIUM) {
    return SPEED_BONUS_MEDIUM;
  }
  return 0;
}

function getStreakMultiplier(streak: number): number {
  if (streak >= 5) return STREAK_MULTIPLIERS[5];
  return STREAK_MULTIPLIERS[streak] || 1;
}

function revealAnswers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  gameState: GameState
) {
  gameState.phase = 'reveal';
  const question = gameState.questions[gameState.currentQuestionIndex];
  const answers = gameState.answers.get(question.id) || {};
  const { gamification } = gameState;

  // Calculate base points
  const baseResult = calculateBasePoints(
    question.type,
    answers.answer1,
    answers.answer2
  );

  let { basePoints, correct } = baseResult;

  // Calculate answer times (seconds from question start)
  const answerTime1 = answers.time1
    ? (answers.time1 - gameState.questionStartTime) / 1000
    : null;
  const answerTime2 = answers.time2
    ? (answers.time2 - gameState.questionStartTime) / 1000
    : null;

  // Calculate speed bonuses (only if correct and not Type C)
  let speedBonus1 = 0;
  let speedBonus2 = 0;
  if (correct && question.type !== 'C' && basePoints > 0) {
    if (answers.time1) {
      speedBonus1 = Math.round(basePoints * calculateSpeedBonus(answers.time1, gameState.questionStartTime));
    }
    if (answers.time2) {
      speedBonus2 = Math.round(basePoints * calculateSpeedBonus(answers.time2, gameState.questionStartTime));
    }
  }

  // Update streaks
  if (correct && question.type !== 'C') {
    gamification.streak1++;
    gamification.streak2++;
    if (answers.answer1 === answers.answer2 && basePoints === BASE_POINTS) {
      gamification.perfectMatches++;
    }
  } else if (question.type !== 'C') {
    gamification.streak1 = 0;
    gamification.streak2 = 0;
  }

  // Update max streaks
  gamification.maxStreak1 = Math.max(gamification.maxStreak1, gamification.streak1);
  gamification.maxStreak2 = Math.max(gamification.maxStreak2, gamification.streak2);

  // Calculate streak bonuses (only if streak >= 2)
  let streakBonus1 = 0;
  let streakBonus2 = 0;
  if (correct && question.type !== 'C' && basePoints > 0) {
    const multiplier1 = getStreakMultiplier(gamification.streak1);
    const multiplier2 = getStreakMultiplier(gamification.streak2);
    if (multiplier1 > 1) {
      streakBonus1 = Math.round(basePoints * (multiplier1 - 1));
    }
    if (multiplier2 > 1) {
      streakBonus2 = Math.round(basePoints * (multiplier2 - 1));
    }
  }

  // Type C bonus for thoughtful answers
  if (question.type === 'C') {
    if (answers.answer1 && answers.answer1.length >= 20) {
      basePoints = TYPE_C_THOUGHTFUL_BONUS;
    }
    if (answers.answer2 && answers.answer2.length >= 20) {
      // Both get bonus if both gave thoughtful answers
    }
    // For Type C, both players get the same bonus if they both gave thoughtful answers
    const thoughtful1 = answers.answer1 && answers.answer1.length >= 20;
    const thoughtful2 = answers.answer2 && answers.answer2.length >= 20;
    basePoints = (thoughtful1 || thoughtful2) ? TYPE_C_THOUGHTFUL_BONUS : 0;
  }

  // Calculate total points
  const points1 = basePoints + speedBonus1 + streakBonus1;
  const points2 = basePoints + speedBonus2 + streakBonus2;

  // Update speed bonus totals
  gamification.speedBonusTotal1 += speedBonus1;
  gamification.speedBonusTotal2 += speedBonus2;

  // Update category stats
  const category = question.category;
  const catStats = gamification.categoryStats.get(category) || { points1: 0, points2: 0, questions: 0 };
  catStats.points1 += points1;
  catStats.points2 += points2;
  catStats.questions++;
  gamification.categoryStats.set(category, catStats);

  // Update scores
  gameState.scores.player1 += points1;
  gameState.scores.player2 += points2;

  // Update scores in database
  gameModel.updateGameScore(
    gameState.gameId,
    gameState.scores.player1,
    gameState.scores.player2
  );

  // Send reveal with gamification data
  const revealData: GameRevealData = {
    questionId: question.id,
    answer1: answers.answer1 || null,
    answer2: answers.answer2 || null,
    correct,
    points1,
    points2,
    questionType: question.type,
    basePoints,
    speedBonus1,
    speedBonus2,
    streakBonus1,
    streakBonus2,
    streak1: gamification.streak1,
    streak2: gamification.streak2,
    answerTime1,
    answerTime2,
    category: question.category
  };

  io.to(roomCode).emit('game:reveal', revealData);

  // Send score update
  io.to(roomCode).emit('game:score-update', {
    score1: gameState.scores.player1,
    score2: gameState.scores.player2
  });

  // Next question or finish
  setTimeout(() => {
    gameState.currentQuestionIndex++;

    if (gameState.currentQuestionIndex >= gameState.questions.length) {
      finishGame(io, roomCode, gameState);
    } else {
      sendQuestion(io, roomCode, gameState);
    }
  }, 5000); // 5 seconds to view results
}

function calculateBasePoints(
  type: QuestionType,
  answer1: string | undefined,
  answer2: string | undefined
): { basePoints: number; correct: boolean } {
  let basePoints = 0;
  let correct = false;

  if (!answer1 || !answer2) {
    return { basePoints, correct };
  }

  switch (type) {
    case 'A':
    case 'B':
    case 'E':
    case 'F':
      if (answer1 === answer2) {
        basePoints = BASE_POINTS;
        correct = true;
      }
      break;

    case 'C':
      // Type C: Open-ended - handled specially in revealAnswers
      correct = true;
      basePoints = 0;
      break;

    case 'D':
      // Type D: Scale comparison
      const val1 = parseInt(answer1, 10);
      const val2 = parseInt(answer2, 10);
      if (!isNaN(val1) && !isNaN(val2)) {
        const diff = Math.abs(val1 - val2);
        if (diff === 0) {
          basePoints = BASE_POINTS;
          correct = true;
        } else if (diff <= 2) {
          basePoints = 50;
          correct = true;
        }
      }
      break;
  }

  return { basePoints, correct };
}

function finishGame(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  gameState: GameState
) {
  // Mark game as finished
  gameModel.finishGame(gameState.gameId);
  roomModel.updateRoomStatus(gameState.roomId, 'finished');

  const { gamification } = gameState;

  // Determine winner
  let winner: 1 | 2 | 'tie';
  if (gameState.scores.player1 > gameState.scores.player2) {
    winner = 1;
  } else if (gameState.scores.player2 > gameState.scores.player1) {
    winner = 2;
  } else {
    winner = 'tie';
  }

  // Calculate correct answers
  let correctAnswers1 = 0;
  let correctAnswers2 = 0;
  gameState.questions.forEach((q, idx) => {
    const answers = gameState.answers.get(q.id);
    if (answers?.answer1 && answers?.answer2) {
      if (q.type === 'C') {
        // For Type C, count as "correct" if both answered
        correctAnswers1++;
        correctAnswers2++;
      } else if (q.type === 'D') {
        const val1 = parseInt(answers.answer1, 10);
        const val2 = parseInt(answers.answer2, 10);
        if (!isNaN(val1) && !isNaN(val2) && Math.abs(val1 - val2) <= 2) {
          correctAnswers1++;
          correctAnswers2++;
        }
      } else if (answers.answer1 === answers.answer2) {
        correctAnswers1++;
        correctAnswers2++;
      }
    }
  });

  // Build category scores
  const categoryScores: CategoryScore[] = [];
  gamification.categoryStats.forEach((stats, category) => {
    const maxPoints = stats.questions * BASE_POINTS * 2; // Max possible for both players
    const totalEarned = stats.points1 + stats.points2;
    const compatibility = maxPoints > 0 ? Math.round((totalEarned / maxPoints) * 100) : 0;

    categoryScores.push({
      category,
      questionsAnswered: stats.questions,
      pointsEarned: totalEarned,
      maxPoints,
      compatibility
    });
  });

  // Sort by compatibility descending
  categoryScores.sort((a, b) => b.compatibility - a.compatibility);

  const finishedData: GameFinishedData = {
    score1: gameState.scores.player1,
    score2: gameState.scores.player2,
    winner,
    totalQuestions: gameState.questions.length,
    correctAnswers1,
    correctAnswers2,
    categoryScores,
    maxStreak1: gamification.maxStreak1,
    maxStreak2: gamification.maxStreak2,
    speedBonusTotal1: gamification.speedBonusTotal1,
    speedBonusTotal2: gamification.speedBonusTotal2,
    perfectMatches: gamification.perfectMatches
  };

  io.to(roomCode).emit('game:finished', finishedData);

  // Clean up game state
  activeGames.delete(roomCode);
}

export function getActiveGamesCount(): number {
  return activeGames.size;
}
