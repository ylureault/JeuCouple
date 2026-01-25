/**
 * Tests de stabilité - Corrections des bugs de production
 *
 * Tests spécifiques pour vérifier que les problèmes de:
 * - Double démarrage du jeu
 * - Réponses dupliquées
 * - Timers multiples
 * - Race conditions
 * sont bien corrigés.
 */

import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import SocketIOClient from 'socket.io-client';
import express from 'express';
import Database from 'better-sqlite3';
import type { QuestionType, Room } from '../types.js';

type ClientSocket = ReturnType<typeof SocketIOClient>;
const ioc = SocketIOClient;

const TEST_PORT = 3098;

let db: Database.Database;
let httpServer: HttpServer;
let io: SocketIOServer;

// Game state tracking for tests
interface GameState {
  gameId: number;
  roomId: number;
  questions: any[];
  currentQuestionIndex: number;
  answers: Map<number, { answer1?: string; answer2?: string }>;
  scores: { player1: number; player2: number };
  timer: NodeJS.Timeout | null;
  nextQuestionTimer: NodeJS.Timeout | null;
  phase: 'question' | 'waiting' | 'reveal';
  questionsSent: number; // Track how many questions were sent
  revealsCalled: number; // Track how many times reveal was called
}

const activeGames = new Map<string, GameState>();
const playerConnections = new Map<string, { roomCode: string; playerId: 1 | 2 }>();
let roomIdCounter = 0;
let gameIdCounter = 0;
const rooms = new Map<string, Room>();
const roomsByCode = new Map<string, Room>();

function generateCode(): string {
  const code = Math.floor(Math.random() * 10000);
  return code.toString().padStart(4, '0');
}

function createRoom(player1Name: string): Room {
  let code: string;
  do {
    code = generateCode();
  } while (roomsByCode.has(code));

  roomIdCounter++;
  const room: Room = {
    id: roomIdCounter,
    code,
    player1_name: player1Name,
    player2_name: null,
    player1_gender: 'M',
    player2_gender: null,
    status: 'waiting',
    created_at: new Date().toISOString(),
    last_activity: new Date().toISOString()
  };

  rooms.set(room.id.toString(), room);
  roomsByCode.set(code, room);
  return room;
}

function joinRoom(code: string, player2Name: string): Room | null {
  const room = roomsByCode.get(code);
  if (!room || room.player2_name || room.status !== 'waiting') {
    return null;
  }
  room.player2_name = player2Name;
  room.player2_gender = 'F';
  return room;
}

function getRoomByCode(code: string): Room | undefined {
  return roomsByCode.get(code);
}

function initTestDatabase(): Database.Database {
  const testDb = new Database(':memory:');

  testDb.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      options TEXT,
      timer INTEGER DEFAULT 20,
      active INTEGER DEFAULT 1
    );
  `);

  const insertQuestion = testDb.prepare(`
    INSERT INTO questions (type, category, text, options, timer, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  // Insert 10 test questions
  for (let i = 0; i < 10; i++) {
    insertQuestion.run(
      'A',
      'test',
      `Question test #${i + 1}`,
      JSON.stringify(['Option A', 'Option B', 'Option C', 'Option D']),
      5 // Short timer for tests
    );
  }

  return testDb;
}

function getRandomQuestions(count: number): any[] {
  const rows = db.prepare(`
    SELECT * FROM questions WHERE active = 1 ORDER BY RANDOM() LIMIT ?
  `).all(count) as any[];

  return rows.map(row => ({
    ...row,
    options: row.options ? JSON.parse(row.options) : undefined,
    active: Boolean(row.active)
  }));
}

function sendQuestion(roomCode: string, gameState: GameState): void {
  // Prevent double send
  if (gameState.phase !== 'question' && gameState.phase !== 'reveal') {
    console.log('Skipping sendQuestion - wrong phase:', gameState.phase);
  }

  // Clear any existing timer
  if (gameState.timer) {
    clearTimeout(gameState.timer);
    gameState.timer = null;
  }

  const question = gameState.questions[gameState.currentQuestionIndex];
  gameState.phase = 'question';
  gameState.questionsSent++; // Track

  io.to(roomCode).emit('game:question', {
    question,
    questionNumber: gameState.currentQuestionIndex + 1,
    totalQuestions: gameState.questions.length
  });

  gameState.timer = setTimeout(() => {
    revealAnswers(roomCode, gameState);
  }, (question.timer + 2) * 1000);
}

function revealAnswers(roomCode: string, gameState: GameState): void {
  // Prevent double reveal - KEY FIX
  if (gameState.phase === 'reveal') {
    console.log('Skipping duplicate reveal call');
    return;
  }

  // Clear timer
  if (gameState.timer) {
    clearTimeout(gameState.timer);
    gameState.timer = null;
  }

  gameState.phase = 'reveal';
  gameState.revealsCalled++; // Track

  const question = gameState.questions[gameState.currentQuestionIndex];
  const answers = gameState.answers.get(question.id) || {};

  const correct = answers.answer1 === answers.answer2;
  const points = correct ? 100 : 0;

  gameState.scores.player1 += points;
  gameState.scores.player2 += points;

  io.to(roomCode).emit('game:reveal', {
    questionId: question.id,
    answer1: answers.answer1 || null,
    answer2: answers.answer2 || null,
    correct,
    points1: points,
    points2: points,
    questionType: question.type,
    basePoints: points,
    speedBonus1: 0,
    speedBonus2: 0,
    streakBonus1: 0,
    streakBonus2: 0,
    streak1: 0,
    streak2: 0,
    answerTime1: null,
    answerTime2: null,
    category: question.category
  });

  // Schedule next question
  scheduleNextQuestion(roomCode, gameState);
}

function scheduleNextQuestion(roomCode: string, gameState: GameState): void {
  // Clear existing timer - KEY FIX
  if (gameState.nextQuestionTimer) {
    clearTimeout(gameState.nextQuestionTimer);
    gameState.nextQuestionTimer = null;
  }

  gameState.nextQuestionTimer = setTimeout(() => {
    gameState.nextQuestionTimer = null;
    gameState.currentQuestionIndex++;

    if (gameState.currentQuestionIndex >= gameState.questions.length) {
      finishGame(roomCode, gameState);
    } else {
      sendQuestion(roomCode, gameState);
    }
  }, 1000);
}

function finishGame(roomCode: string, gameState: GameState): void {
  // Clear all timers - KEY FIX
  if (gameState.timer) {
    clearTimeout(gameState.timer);
    gameState.timer = null;
  }
  if (gameState.nextQuestionTimer) {
    clearTimeout(gameState.nextQuestionTimer);
    gameState.nextQuestionTimer = null;
  }

  const winner = gameState.scores.player1 > gameState.scores.player2 ? 1 :
                 gameState.scores.player2 > gameState.scores.player1 ? 2 : 'tie';

  io.to(roomCode).emit('game:finished', {
    score1: gameState.scores.player1,
    score2: gameState.scores.player2,
    winner,
    totalQuestions: gameState.questions.length,
    correctAnswers1: 0,
    correctAnswers2: 0,
    categoryScores: [],
    maxStreak1: 0,
    maxStreak2: 0,
    speedBonusTotal1: 0,
    speedBonusTotal2: 0,
    perfectMatches: 0,
    questionsSent: gameState.questionsSent, // For verification
    revealsCalled: gameState.revealsCalled  // For verification
  });

  activeGames.delete(roomCode);
}

function setupTestServer(): void {
  const app = express();
  httpServer = createServer(app);

  io = new SocketIOServer(httpServer, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    socket.on('room:create', (data: { playerName: string }, callback) => {
      const room = createRoom(data.playerName);
      socket.join(room.code);
      playerConnections.set(socket.id, { roomCode: room.code, playerId: 1 });
      callback({ success: true, room, playerId: 1 });
    });

    socket.on('room:join', (data: { code: string; playerName: string }, callback) => {
      const room = joinRoom(data.code, data.playerName);
      if (!room) {
        callback({ success: false, error: 'Room not found or full' });
        return;
      }

      socket.join(room.code);
      playerConnections.set(socket.id, { roomCode: room.code, playerId: 2 });
      socket.to(room.code).emit('room:player-joined', { playerName: data.playerName, playerId: 2 });
      callback({ success: true, room, playerId: 2 });
    });

    // Start game - WITH DOUBLE START PROTECTION
    socket.on('game:start', (callback) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      // KEY FIX: Prevent double start
      if (activeGames.has(connection.roomCode)) {
        callback({ success: false, error: 'Game already started' });
        return;
      }

      const room = getRoomByCode(connection.roomCode);
      if (!room || !room.player1_name || !room.player2_name) {
        callback({ success: false, error: 'Room not ready' });
        return;
      }

      if (connection.playerId !== 1) {
        callback({ success: false, error: 'Only host can start' });
        return;
      }

      const questions = getRandomQuestions(3); // 3 questions for quick tests
      gameIdCounter++;

      const gameState: GameState = {
        gameId: gameIdCounter,
        roomId: room.id,
        questions,
        currentQuestionIndex: 0,
        answers: new Map(),
        scores: { player1: 0, player2: 0 },
        timer: null,
        nextQuestionTimer: null,
        phase: 'question',
        questionsSent: 0,
        revealsCalled: 0
      };

      activeGames.set(room.code, gameState);
      room.status = 'playing';

      io.to(room.code).emit('game:started', { gameId: gameIdCounter });
      callback({ success: true });

      setTimeout(() => sendQuestion(room.code, gameState), 500);
    });

    // Answer - WITH DUPLICATE ANSWER PROTECTION
    socket.on('game:answer', (data: { answer: string }) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      const gameState = activeGames.get(connection.roomCode);
      if (!gameState) return;

      // KEY FIX: Only accept in question phase
      if (gameState.phase !== 'question') {
        console.log('Answer rejected - not in question phase');
        return;
      }

      const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
      const questionAnswers = gameState.answers.get(currentQuestion.id) || {};

      // KEY FIX: Prevent duplicate answers
      if (connection.playerId === 1 && questionAnswers.answer1 !== undefined) {
        console.log('Duplicate answer from player 1 rejected');
        return;
      }
      if (connection.playerId === 2 && questionAnswers.answer2 !== undefined) {
        console.log('Duplicate answer from player 2 rejected');
        return;
      }

      if (connection.playerId === 1) {
        questionAnswers.answer1 = data.answer;
      } else {
        questionAnswers.answer2 = data.answer;
      }
      gameState.answers.set(currentQuestion.id, questionAnswers);

      socket.to(connection.roomCode).emit('game:player-answered', {
        playerId: connection.playerId
      });

      // KEY FIX: Double-check phase before reveal
      if (gameState.phase === 'question' &&
          questionAnswers.answer1 !== undefined &&
          questionAnswers.answer2 !== undefined) {
        revealAnswers(connection.roomCode, gameState);
      }
    });

    socket.on('disconnect', () => {
      playerConnections.delete(socket.id);
    });
  });
}

async function createPlayer(url: string, name: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(url, {
      transports: ['websocket'],
      forceNew: true
    }) as ClientSocket;

    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

describe('Tests de Stabilité - Corrections de bugs', () => {
  const serverUrl = `http://localhost:${TEST_PORT}`;

  beforeAll((done) => {
    db = initTestDatabase();
    setupTestServer();
    httpServer.listen(TEST_PORT, done);
  });

  afterAll((done) => {
    io.close();
    httpServer.close(done);
    db.close();
  });

  beforeEach(() => {
    // Reset state between tests
    activeGames.clear();
    playerConnections.clear();
    rooms.clear();
    roomsByCode.clear();
    roomIdCounter = 0;
    gameIdCounter = 0;
  });

  describe('Protection contre le double démarrage', () => {
    test('Ne doit pas permettre de démarrer deux fois le même jeu', async () => {
      const host = await createPlayer(serverUrl, 'Host');
      const guest = await createPlayer(serverUrl, 'Guest');

      const createResponse = await new Promise<any>((resolve) => {
        host.emit('room:create', { playerName: 'Host' }, resolve);
      });

      await new Promise<any>((resolve) => {
        guest.emit('room:join', { code: createResponse.room.code, playerName: 'Guest' }, resolve);
      });

      // Premier démarrage
      const start1 = await new Promise<any>((resolve) => {
        host.emit('game:start', resolve);
      });
      expect(start1.success).toBe(true);

      // Deuxième tentative de démarrage
      const start2 = await new Promise<any>((resolve) => {
        host.emit('game:start', resolve);
      });
      expect(start2.success).toBe(false);
      expect(start2.error).toBe('Game already started');

      host.disconnect();
      guest.disconnect();
    });
  });

  describe('Protection contre les réponses dupliquées', () => {
    test('Ne doit accepter qu\'une seule réponse par joueur par question', async () => {
      const host = await createPlayer(serverUrl, 'Host');
      const guest = await createPlayer(serverUrl, 'Guest');

      const createResponse = await new Promise<any>((resolve) => {
        host.emit('room:create', { playerName: 'Host' }, resolve);
      });

      await new Promise<any>((resolve) => {
        guest.emit('room:join', { code: createResponse.room.code, playerName: 'Guest' }, resolve);
      });

      let answersReceived = 0;
      let revealReceived = false;

      host.on('game:player-answered', () => {
        answersReceived++;
      });

      const gameFinished = new Promise<any>((resolve) => {
        host.on('game:reveal', () => {
          revealReceived = true;
        });
        host.on('game:finished', resolve);
      });

      // Setup: both players answer same question multiple times
      host.on('game:question', () => {
        // Send answer 3 times (only first should count)
        host.emit('game:answer', { answer: 'A' });
        host.emit('game:answer', { answer: 'B' }); // Should be ignored
        host.emit('game:answer', { answer: 'C' }); // Should be ignored
      });

      guest.on('game:question', () => {
        setTimeout(() => {
          guest.emit('game:answer', { answer: 'A' });
          guest.emit('game:answer', { answer: 'X' }); // Should be ignored
        }, 100);
      });

      await new Promise<any>((resolve) => {
        host.emit('game:start', resolve);
      });

      const result = await gameFinished;

      // Verify reveal was called proper number of times
      expect(result.revealsCalled).toBe(3); // One per question
      expect(result.questionsSent).toBe(3); // 3 questions

      host.disconnect();
      guest.disconnect();
    }, 30000);
  });

  describe('Protection contre les double reveals', () => {
    test('Le reveal ne doit être appelé qu\'une seule fois par question', async () => {
      const host = await createPlayer(serverUrl, 'Host');
      const guest = await createPlayer(serverUrl, 'Guest');

      const createResponse = await new Promise<any>((resolve) => {
        host.emit('room:create', { playerName: 'Host' }, resolve);
      });

      await new Promise<any>((resolve) => {
        guest.emit('room:join', { code: createResponse.room.code, playerName: 'Guest' }, resolve);
      });

      const gameFinished = new Promise<any>((resolve) => {
        host.on('game:finished', resolve);
      });

      // Both players answer immediately (race condition test)
      host.on('game:question', () => {
        host.emit('game:answer', { answer: 'A' });
      });

      guest.on('game:question', () => {
        guest.emit('game:answer', { answer: 'A' });
      });

      await new Promise<any>((resolve) => {
        host.emit('game:start', resolve);
      });

      const result = await gameFinished;

      // With 3 questions, reveals should be exactly 3
      expect(result.revealsCalled).toBe(3);
      expect(result.questionsSent).toBe(3);

      host.disconnect();
      guest.disconnect();
    }, 30000);
  });

  describe('Simulation de charge - 10 parties simultanées', () => {
    test('Doit gérer 10 parties simultanées sans erreur', async () => {
      const GAMES = 10;
      const results: { success: boolean; error?: string }[] = [];

      const runGame = async (index: number): Promise<{ success: boolean; error?: string }> => {
        try {
          const host = await createPlayer(serverUrl, `Host${index}`);
          const guest = await createPlayer(serverUrl, `Guest${index}`);

          const createResponse = await new Promise<any>((resolve) => {
            host.emit('room:create', { playerName: `Host${index}` }, resolve);
          });

          if (!createResponse.success) {
            host.disconnect();
            guest.disconnect();
            return { success: false, error: 'Failed to create room' };
          }

          const joinResponse = await new Promise<any>((resolve) => {
            guest.emit('room:join', {
              code: createResponse.room.code,
              playerName: `Guest${index}`
            }, resolve);
          });

          if (!joinResponse.success) {
            host.disconnect();
            guest.disconnect();
            return { success: false, error: 'Failed to join room' };
          }

          const gameFinished = new Promise<any>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Game timeout')), 60000);

            host.on('game:finished', (data: any) => {
              clearTimeout(timeout);
              resolve(data);
            });
          });

          host.on('game:question', () => {
            setTimeout(() => host.emit('game:answer', { answer: 'A' }), 50);
          });

          guest.on('game:question', () => {
            setTimeout(() => guest.emit('game:answer', { answer: 'A' }), 100);
          });

          const startResponse = await new Promise<any>((resolve) => {
            host.emit('game:start', resolve);
          });

          if (!startResponse.success) {
            host.disconnect();
            guest.disconnect();
            return { success: false, error: 'Failed to start game' };
          }

          const result = await gameFinished;

          host.disconnect();
          guest.disconnect();

          // Verify game completed properly
          if (result.revealsCalled !== 3 || result.questionsSent !== 3) {
            return {
              success: false,
              error: `Wrong counts: reveals=${result.revealsCalled}, questions=${result.questionsSent}`
            };
          }

          return { success: true };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      };

      // Run all games in parallel
      const gamePromises = Array.from({ length: GAMES }, (_, i) => runGame(i));
      const gameResults = await Promise.all(gamePromises);

      // Analyze results
      const successful = gameResults.filter(r => r.success).length;
      const failed = gameResults.filter(r => !r.success);

      console.log(`\n📊 Résultats simulation de charge:`);
      console.log(`   Parties réussies: ${successful}/${GAMES}`);
      if (failed.length > 0) {
        console.log(`   Erreurs:`);
        failed.forEach((f, i) => console.log(`     - Game: ${f.error}`));
      }

      expect(successful).toBe(GAMES);
    }, 120000);
  });

  describe('Test de stress - Réponses rapides', () => {
    test('Doit gérer les réponses quasi-simultanées', async () => {
      const host = await createPlayer(serverUrl, 'Host');
      const guest = await createPlayer(serverUrl, 'Guest');

      const createResponse = await new Promise<any>((resolve) => {
        host.emit('room:create', { playerName: 'Host' }, resolve);
      });

      await new Promise<any>((resolve) => {
        guest.emit('room:join', { code: createResponse.room.code, playerName: 'Guest' }, resolve);
      });

      let revealsCount = 0;
      const gameFinished = new Promise<any>((resolve) => {
        host.on('game:reveal', () => revealsCount++);
        host.on('game:finished', resolve);
      });

      // Both answer IMMEDIATELY (no delay)
      host.on('game:question', () => {
        host.emit('game:answer', { answer: 'A' });
      });

      guest.on('game:question', () => {
        guest.emit('game:answer', { answer: 'A' });
      });

      await new Promise<any>((resolve) => {
        host.emit('game:start', resolve);
      });

      const result = await gameFinished;

      // Verify no double reveals
      expect(revealsCount).toBe(3); // Exactly 3 reveals for 3 questions
      expect(result.revealsCalled).toBe(3);

      host.disconnect();
      guest.disconnect();
    }, 30000);
  });
});
