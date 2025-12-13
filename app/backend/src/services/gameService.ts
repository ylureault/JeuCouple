import { Server, Socket } from 'socket.io';
import type {
  Room,
  Question,
  QuestionType,
  ServerToClientEvents,
  ClientToServerEvents,
  GameRevealData,
  GameFinishedData
} from '../../../shared/types.js';
import * as roomModel from '../models/room.js';
import * as gameModel from '../models/game.js';
import * as questionModel from '../models/question.js';

interface GameState {
  gameId: number;
  roomId: number;
  questions: Question[];
  currentQuestionIndex: number;
  answers: Map<number, { answer1?: string; answer2?: string }>;
  scores: { player1: number; player2: number };
  timer: NodeJS.Timeout | null;
  phase: 'question' | 'waiting' | 'reveal';
}

interface PlayerConnection {
  socket: Socket;
  roomCode: string;
  playerId: 1 | 2;
}

const activeGames = new Map<string, GameState>();
const playerConnections = new Map<string, PlayerConnection>();

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

      // Initialize game state
      const gameState: GameState = {
        gameId: game.id,
        roomId: room.id,
        questions,
        currentQuestionIndex: 0,
        answers: new Map(),
        scores: { player1: 0, player2: 0 },
        timer: null,
        phase: 'question'
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

      // Save answer
      const questionAnswers = gameState.answers.get(currentQuestion.id) || {};
      if (connection.playerId === 1) {
        questionAnswers.answer1 = data.answer;
      } else {
        questionAnswers.answer2 = data.answer;
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

function revealAnswers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  gameState: GameState
) {
  gameState.phase = 'reveal';
  const question = gameState.questions[gameState.currentQuestionIndex];
  const answers = gameState.answers.get(question.id) || {};

  // Calculate points based on question type
  const { points1, points2, correct } = calculatePoints(
    question.type,
    answers.answer1,
    answers.answer2
  );

  gameState.scores.player1 += points1;
  gameState.scores.player2 += points2;

  // Update scores in database
  gameModel.updateGameScore(
    gameState.gameId,
    gameState.scores.player1,
    gameState.scores.player2
  );

  // Send reveal
  const revealData: GameRevealData = {
    questionId: question.id,
    answer1: answers.answer1 || null,
    answer2: answers.answer2 || null,
    correct,
    points1,
    points2,
    questionType: question.type
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

function calculatePoints(
  type: QuestionType,
  answer1: string | undefined,
  answer2: string | undefined
): { points1: number; points2: number; correct: boolean } {
  // Default: no points
  let points1 = 0;
  let points2 = 0;
  let correct = false;

  if (!answer1 || !answer2) {
    return { points1, points2, correct };
  }

  switch (type) {
    case 'A':
      // Type A: Player guesses what the other will answer
      // Each player gets points if they correctly guessed the other's answer
      // For simplicity, we check if answers match
      if (answer1 === answer2) {
        points1 = 100;
        points2 = 100;
        correct = true;
      }
      break;

    case 'B':
      // Type B: Both players should answer the same
      if (answer1 === answer2) {
        points1 = 100;
        points2 = 100;
        correct = true;
      }
      break;

    case 'C':
      // Type C: Open-ended, no automatic scoring
      correct = true; // Always "correct" for display purposes
      break;

    case 'D':
      // Type D: Scale comparison
      // Points based on how close the answers are
      const val1 = parseInt(answer1, 10);
      const val2 = parseInt(answer2, 10);
      if (!isNaN(val1) && !isNaN(val2)) {
        const diff = Math.abs(val1 - val2);
        if (diff === 0) {
          points1 = 100;
          points2 = 100;
          correct = true;
        } else if (diff <= 2) {
          points1 = 50;
          points2 = 50;
          correct = true;
        }
      }
      break;

    case 'E':
      // Type E: "Tu es plutot..." - Binary choice
      // Both players should choose the same option (about themselves)
      if (answer1 === answer2) {
        points1 = 100;
        points2 = 100;
        correct = true;
      }
      break;

    case 'F':
      // Type F: "Qui de nous deux" - Consensus required
      // Both players must agree on who fits the description
      // answer format: "player1" or "player2"
      if (answer1 === answer2) {
        points1 = 100;
        points2 = 100;
        correct = true;
      }
      break;
  }

  return { points1, points2, correct };
}

function finishGame(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  gameState: GameState
) {
  // Mark game as finished
  gameModel.finishGame(gameState.gameId);
  roomModel.updateRoomStatus(gameState.roomId, 'finished');

  // Determine winner
  let winner: 1 | 2 | 'tie';
  if (gameState.scores.player1 > gameState.scores.player2) {
    winner = 1;
  } else if (gameState.scores.player2 > gameState.scores.player1) {
    winner = 2;
  } else {
    winner = 'tie';
  }

  // Calculate correct answers (simplified)
  let correctAnswers1 = 0;
  let correctAnswers2 = 0;
  gameState.answers.forEach((answers) => {
    if (answers.answer1 && answers.answer2 && answers.answer1 === answers.answer2) {
      correctAnswers1++;
      correctAnswers2++;
    }
  });

  const finishedData: GameFinishedData = {
    score1: gameState.scores.player1,
    score2: gameState.scores.player2,
    winner,
    totalQuestions: gameState.questions.length,
    correctAnswers1,
    correctAnswers2
  };

  io.to(roomCode).emit('game:finished', finishedData);

  // Clean up game state
  activeGames.delete(roomCode);
}

export function getActiveGamesCount(): number {
  return activeGames.size;
}
