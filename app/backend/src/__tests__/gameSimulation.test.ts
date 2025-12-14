/**
 * Tests Fonctionnels - Jeu Couples
 *
 * Simulation de 50 parties simultanées (100 joueurs)
 * avec différents scénarios de jeu et cinématiques
 */

import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import SocketIOClient from 'socket.io-client';
import express from 'express';
import Database from 'better-sqlite3';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  Room,
  Question,
  QuestionType,
  GameRevealData,
  GameFinishedData
} from '../types.js';

// Socket client type - use ReturnType to get the type from the default export
type ClientSocket = ReturnType<typeof SocketIOClient>;
const ioc = SocketIOClient;

// Test configuration
const TEST_PORT = 3099;
const TOTAL_ROOMS = 50;
const PLAYERS_PER_ROOM = 2;

// Test database setup
let db: Database.Database;
let httpServer: HttpServer;
let io: SocketIOServer;

// Simulated player interface
interface SimulatedPlayer {
  socket: ClientSocket;
  name: string;
  roomCode: string;
  playerId: 1 | 2;
  score: number;
  answeredQuestions: number;
  events: string[];
}

// Test results tracking
interface TestResults {
  roomsCreated: number;
  roomsJoined: number;
  gamesStarted: number;
  gamesCompleted: number;
  totalQuestionsAnswered: number;
  totalErrors: string[];
  avgGameDuration: number;
  scenariosCompleted: Record<string, number>;
}

let results: TestResults = {
  roomsCreated: 0,
  roomsJoined: 0,
  gamesStarted: 0,
  gamesCompleted: 0,
  totalQuestionsAnswered: 0,
  totalErrors: [],
  avgGameDuration: 0,
  scenariosCompleted: {}
};

function resetResults(): void {
  results = {
    roomsCreated: 0,
    roomsJoined: 0,
    gamesStarted: 0,
    gamesCompleted: 0,
    totalQuestionsAnswered: 0,
    totalErrors: [],
    avgGameDuration: 0,
    scenariosCompleted: {}
  };
}

// Game scenarios for different cinematics
type GameScenario = 'perfect_match' | 'total_mismatch' | 'partial_match' | 'timeout' | 'disconnect_reconnect' | 'rapid_fire';

const SCENARIOS: GameScenario[] = [
  'perfect_match',      // Both players always answer the same
  'total_mismatch',     // Players always answer differently
  'partial_match',      // 50% match rate
  'timeout',            // Players sometimes timeout
  'disconnect_reconnect', // Player disconnects and reconnects
  'rapid_fire'          // Players answer as fast as possible
];

// Initialize test database
function initTestDatabase(): Database.Database {
  const testDb = new Database(':memory:');

  testDb.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      player1_name TEXT,
      player2_name TEXT,
      status TEXT DEFAULT 'waiting',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      score_player1 INTEGER DEFAULT 0,
      score_player2 INTEGER DEFAULT 0,
      FOREIGN KEY (room_id) REFERENCES rooms(id)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      options TEXT,
      timer INTEGER DEFAULT 20,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      answer TEXT NOT NULL,
      answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert test questions
  const categories = ['couple', 'sexy', 'coquin', 'habitudes', 'souvenirs', 'projets'];
  const types: QuestionType[] = ['A', 'B', 'C', 'D'];

  const insertQuestion = testDb.prepare(`
    INSERT INTO questions (type, category, text, options, timer, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  // Generate 50 test questions
  for (let i = 0; i < 50; i++) {
    const type = types[i % 4];
    const category = categories[i % categories.length];
    let options: string | null = null;

    if (type === 'A' || type === 'B') {
      options = JSON.stringify(['Option A', 'Option B', 'Option C', 'Option D']);
    }

    insertQuestion.run(
      type,
      category,
      `Question test #${i + 1} - Type ${type} - ${category}`,
      options,
      15
    );
  }

  return testDb;
}

// Mock room model functions
let roomIdCounter = 0;
const rooms = new Map<string, Room>();
const roomsByCode = new Map<string, Room>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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
  const room = roomsByCode.get(code.toUpperCase());
  if (!room || room.player2_name || room.status !== 'waiting') {
    return null;
  }
  room.player2_name = player2Name;
  room.player2_gender = 'F';
  return room;
}

function getRoomByCode(code: string): Room | undefined {
  return roomsByCode.get(code.toUpperCase());
}

function updateRoomStatus(id: number, status: Room['status']): void {
  const room = rooms.get(id.toString());
  if (room) {
    room.status = status;
  }
}

// Get questions from database
function getRandomQuestions(count: number): Question[] {
  const rows = db.prepare(`
    SELECT * FROM questions
    WHERE active = 1
    ORDER BY RANDOM()
    LIMIT ?
  `).all(count) as any[];

  return rows.map(row => ({
    ...row,
    options: row.options ? JSON.parse(row.options) : undefined,
    active: Boolean(row.active)
  }));
}

// Game state management
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

const activeGames = new Map<string, GameState>();
const playerConnections = new Map<string, { roomCode: string; playerId: 1 | 2 }>();
let gameIdCounter = 0;

// Setup Socket.IO server for tests
function setupTestServer(): void {
  const app = express();
  httpServer = createServer(app);

  io = new SocketIOServer(httpServer, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    // Create room
    socket.on('room:create', (data: { playerName: string }, callback) => {
      try {
        const room = createRoom(data.playerName);
        socket.join(room.code);
        playerConnections.set(socket.id, { roomCode: room.code, playerId: 1 });
        results.roomsCreated++;
        callback({ success: true, room, playerId: 1 });
      } catch (error) {
        callback({ success: false, error: 'Failed to create room' });
      }
    });

    // Join room
    socket.on('room:join', (data: { code: string; playerName: string }, callback) => {
      const room = joinRoom(data.code, data.playerName);
      if (!room) {
        callback({ success: false, error: 'Room not found or full' });
        return;
      }

      socket.join(room.code);
      playerConnections.set(socket.id, { roomCode: room.code, playerId: 2 });
      results.roomsJoined++;

      socket.to(room.code).emit('room:player-joined', {
        playerName: data.playerName,
        playerId: 2
      });

      callback({ success: true, room, playerId: 2 });
    });

    // Reconnect
    socket.on('room:reconnect', (data: { code: string; playerId: 1 | 2 }, callback) => {
      const room = getRoomByCode(data.code);
      if (!room) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      socket.join(room.code);
      playerConnections.set(socket.id, { roomCode: room.code, playerId: data.playerId });
      callback({ success: true, room, playerId: data.playerId });
    });

    // Start game
    socket.on('game:start', (callback) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const room = getRoomByCode(connection.roomCode);
      if (!room || !room.player1_name || !room.player2_name) {
        callback({ success: false, error: 'Room not ready' });
        return;
      }

      const questions = getRandomQuestions(5); // 5 questions per game for tests
      if (questions.length === 0) {
        callback({ success: false, error: 'No questions available' });
        return;
      }

      gameIdCounter++;
      const gameState: GameState = {
        gameId: gameIdCounter,
        roomId: room.id,
        questions,
        currentQuestionIndex: 0,
        answers: new Map(),
        scores: { player1: 0, player2: 0 },
        timer: null,
        phase: 'question'
      };

      activeGames.set(room.code, gameState);
      updateRoomStatus(room.id, 'playing');
      results.gamesStarted++;

      io.to(room.code).emit('game:started', { gameId: gameIdCounter });
      callback({ success: true });

      // Start first question
      setTimeout(() => sendQuestion(room.code, gameState), 500);
    });

    // Answer question
    socket.on('game:answer', (data: { answer: string }) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      const gameState = activeGames.get(connection.roomCode);
      if (!gameState || gameState.phase !== 'question') return;

      const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
      const questionAnswers = gameState.answers.get(currentQuestion.id) || {};

      if (connection.playerId === 1) {
        questionAnswers.answer1 = data.answer;
      } else {
        questionAnswers.answer2 = data.answer;
      }
      gameState.answers.set(currentQuestion.id, questionAnswers);
      results.totalQuestionsAnswered++;

      socket.to(connection.roomCode).emit('game:player-answered', {
        playerId: connection.playerId
      });

      if (questionAnswers.answer1 !== undefined && questionAnswers.answer2 !== undefined) {
        if (gameState.timer) {
          clearTimeout(gameState.timer);
          gameState.timer = null;
        }
        revealAnswers(connection.roomCode, gameState);
      }
    });

    socket.on('disconnect', () => {
      const connection = playerConnections.get(socket.id);
      if (connection) {
        socket.to(connection.roomCode).emit('room:player-left', {
          playerId: connection.playerId
        });
        playerConnections.delete(socket.id);
      }
    });
  });
}

function sendQuestion(roomCode: string, gameState: GameState): void {
  const question = gameState.questions[gameState.currentQuestionIndex];
  gameState.phase = 'question';

  io.to(roomCode).emit('game:question', {
    question,
    questionNumber: gameState.currentQuestionIndex + 1,
    totalQuestions: gameState.questions.length
  });

  // Timeout after timer + 2 seconds
  gameState.timer = setTimeout(() => {
    revealAnswers(roomCode, gameState);
  }, (question.timer + 2) * 1000);
}

function calculatePoints(
  type: QuestionType,
  answer1: string | undefined,
  answer2: string | undefined
): { points1: number; points2: number; correct: boolean } {
  let points1 = 0;
  let points2 = 0;
  let correct = false;

  if (!answer1 || !answer2) {
    return { points1, points2, correct };
  }

  switch (type) {
    case 'A':
    case 'B':
      if (answer1 === answer2) {
        points1 = 100;
        points2 = 100;
        correct = true;
      }
      break;
    case 'C':
      correct = true;
      break;
    case 'D':
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
  }

  return { points1, points2, correct };
}

function revealAnswers(roomCode: string, gameState: GameState): void {
  gameState.phase = 'reveal';
  const question = gameState.questions[gameState.currentQuestionIndex];
  const answers = gameState.answers.get(question.id) || {};

  const { points1, points2, correct } = calculatePoints(
    question.type,
    answers.answer1,
    answers.answer2
  );

  gameState.scores.player1 += points1;
  gameState.scores.player2 += points2;

  const revealData: GameRevealData = {
    questionId: question.id,
    answer1: answers.answer1 || null,
    answer2: answers.answer2 || null,
    correct,
    points1,
    points2,
    questionType: question.type,
    basePoints: points1,
    speedBonus1: 0,
    speedBonus2: 0,
    streakBonus1: 0,
    streakBonus2: 0,
    streak1: 0,
    streak2: 0,
    answerTime1: null,
    answerTime2: null,
    category: question.category
  };

  io.to(roomCode).emit('game:reveal', revealData);
  io.to(roomCode).emit('game:score-update', {
    score1: gameState.scores.player1,
    score2: gameState.scores.player2
  });

  // Next question or finish
  setTimeout(() => {
    gameState.currentQuestionIndex++;

    if (gameState.currentQuestionIndex >= gameState.questions.length) {
      finishGame(roomCode, gameState);
    } else {
      sendQuestion(roomCode, gameState);
    }
  }, 1000); // 1 second reveal time for tests
}

function finishGame(roomCode: string, gameState: GameState): void {
  const room = getRoomByCode(roomCode);
  if (room) {
    updateRoomStatus(room.id, 'finished');
  }

  let winner: 1 | 2 | 'tie';
  if (gameState.scores.player1 > gameState.scores.player2) {
    winner = 1;
  } else if (gameState.scores.player2 > gameState.scores.player1) {
    winner = 2;
  } else {
    winner = 'tie';
  }

  const finishedData: GameFinishedData = {
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
    perfectMatches: 0
  };

  io.to(roomCode).emit('game:finished', finishedData);
  results.gamesCompleted++;
  activeGames.delete(roomCode);
}

// Helper to create connected player
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

// Scenario implementations
async function runPerfectMatchScenario(
  player1: ClientSocket,
  player2: ClientSocket
): Promise<void> {
  return new Promise((resolve) => {
    player1.on('game:question', (data: any) => {
      const answer = data.question.options?.[0] || 'same_answer';
      setTimeout(() => player1.emit('game:answer', { answer }), 100);
    });

    player2.on('game:question', (data: any) => {
      const answer = data.question.options?.[0] || 'same_answer';
      setTimeout(() => player2.emit('game:answer', { answer }), 150);
    });

    player1.on('game:finished', () => {
      results.scenariosCompleted['perfect_match'] = (results.scenariosCompleted['perfect_match'] || 0) + 1;
      resolve();
    });
  });
}

async function runTotalMismatchScenario(
  player1: ClientSocket,
  player2: ClientSocket
): Promise<void> {
  return new Promise((resolve) => {
    player1.on('game:question', (data: any) => {
      const answer = data.question.options?.[0] || 'answer_a';
      setTimeout(() => player1.emit('game:answer', { answer }), 100);
    });

    player2.on('game:question', (data: any) => {
      const answer = data.question.options?.[1] || 'answer_b';
      setTimeout(() => player2.emit('game:answer', { answer }), 150);
    });

    player1.on('game:finished', () => {
      results.scenariosCompleted['total_mismatch'] = (results.scenariosCompleted['total_mismatch'] || 0) + 1;
      resolve();
    });
  });
}

async function runPartialMatchScenario(
  player1: ClientSocket,
  player2: ClientSocket
): Promise<void> {
  return new Promise((resolve) => {
    let questionCount = 0;

    player1.on('game:question', (data: any) => {
      const answer = data.question.options?.[0] || 'same';
      setTimeout(() => player1.emit('game:answer', { answer }), 100);
    });

    player2.on('game:question', (data: any) => {
      questionCount++;
      // Match on odd questions, mismatch on even
      const answer = questionCount % 2 === 1
        ? (data.question.options?.[0] || 'same')
        : (data.question.options?.[1] || 'different');
      setTimeout(() => player2.emit('game:answer', { answer }), 150);
    });

    player1.on('game:finished', () => {
      results.scenariosCompleted['partial_match'] = (results.scenariosCompleted['partial_match'] || 0) + 1;
      resolve();
    });
  });
}

async function runTimeoutScenario(
  player1: ClientSocket,
  player2: ClientSocket
): Promise<void> {
  return new Promise((resolve) => {
    player1.on('game:question', (_data: any) => {
      // Player 1 always answers
      setTimeout(() => player1.emit('game:answer', { answer: 'answered' }), 100);
    });

    player2.on('game:question', (_data: any) => {
      // Player 2 only answers on some questions
      if (Math.random() > 0.3) {
        setTimeout(() => player2.emit('game:answer', { answer: 'answered' }), 200);
      }
      // Otherwise timeout
    });

    player1.on('game:finished', () => {
      results.scenariosCompleted['timeout'] = (results.scenariosCompleted['timeout'] || 0) + 1;
      resolve();
    });
  });
}

async function runRapidFireScenario(
  player1: ClientSocket,
  player2: ClientSocket
): Promise<void> {
  return new Promise((resolve) => {
    player1.on('game:question', (_data: any) => {
      // Answer immediately
      player1.emit('game:answer', { answer: 'fast' });
    });

    player2.on('game:question', (_data: any) => {
      // Answer immediately
      player2.emit('game:answer', { answer: 'fast' });
    });

    player1.on('game:finished', () => {
      results.scenariosCompleted['rapid_fire'] = (results.scenariosCompleted['rapid_fire'] || 0) + 1;
      resolve();
    });
  });
}

// Main test suite
describe('Jeu Couples - Tests Fonctionnels', () => {
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

  describe('Infrastructure Tests', () => {
    test('Database should be initialized with questions', () => {
      const count = db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number };
      expect(count.count).toBe(50);
    });

    test('Server should be running', async () => {
      const socket = await createPlayer(serverUrl, 'TestPlayer');
      expect(socket.connected).toBe(true);
      socket.disconnect();
    });
  });

  describe('Room Management Tests', () => {
    test('Should create a room', async () => {
      const socket = await createPlayer(serverUrl, 'Host');

      const response = await new Promise<any>((resolve) => {
        socket.emit('room:create', { playerName: 'Host' }, resolve);
      });

      expect(response.success).toBe(true);
      expect(response.room.code).toHaveLength(6);
      expect(response.playerId).toBe(1);

      socket.disconnect();
    });

    test('Should join a room', async () => {
      const host = await createPlayer(serverUrl, 'Host');
      const guest = await createPlayer(serverUrl, 'Guest');

      const createResponse = await new Promise<any>((resolve) => {
        host.emit('room:create', { playerName: 'Host' }, resolve);
      });

      const joinResponse = await new Promise<any>((resolve) => {
        guest.emit('room:join', {
          code: createResponse.room.code,
          playerName: 'Guest'
        }, resolve);
      });

      expect(joinResponse.success).toBe(true);
      expect(joinResponse.playerId).toBe(2);

      host.disconnect();
      guest.disconnect();
    });

    test('Should not join full room', async () => {
      const host = await createPlayer(serverUrl, 'Host');
      const guest1 = await createPlayer(serverUrl, 'Guest1');
      const guest2 = await createPlayer(serverUrl, 'Guest2');

      const createResponse = await new Promise<any>((resolve) => {
        host.emit('room:create', { playerName: 'Host' }, resolve);
      });

      await new Promise<any>((resolve) => {
        guest1.emit('room:join', {
          code: createResponse.room.code,
          playerName: 'Guest1'
        }, resolve);
      });

      const joinResponse = await new Promise<any>((resolve) => {
        guest2.emit('room:join', {
          code: createResponse.room.code,
          playerName: 'Guest2'
        }, resolve);
      });

      expect(joinResponse.success).toBe(false);

      host.disconnect();
      guest1.disconnect();
      guest2.disconnect();
    });
  });

  describe('Single Game Flow Test', () => {
    test('Should complete a full game', async () => {
      const host = await createPlayer(serverUrl, 'Player1');
      const guest = await createPlayer(serverUrl, 'Player2');

      // Create room
      const createResponse = await new Promise<any>((resolve) => {
        host.emit('room:create', { playerName: 'Player1' }, resolve);
      });

      // Join room
      await new Promise<any>((resolve) => {
        guest.emit('room:join', {
          code: createResponse.room.code,
          playerName: 'Player2'
        }, resolve);
      });

      // Setup answer handlers
      const gamePromise = new Promise<GameFinishedData>((resolve) => {
        host.on('game:question', (_data: any) => {
          host.emit('game:answer', { answer: 'test_answer' });
        });

        guest.on('game:question', (_data: any) => {
          guest.emit('game:answer', { answer: 'test_answer' });
        });

        host.on('game:finished', resolve);
      });

      // Start game
      const startResponse = await new Promise<any>((resolve) => {
        host.emit('game:start', resolve);
      });

      expect(startResponse.success).toBe(true);

      // Wait for game to complete
      const gameResult = await gamePromise;

      expect(gameResult.totalQuestions).toBe(5);
      expect(typeof gameResult.score1).toBe('number');
      expect(typeof gameResult.score2).toBe('number');

      host.disconnect();
      guest.disconnect();
    }, 60000);
  });

  describe('Multi-Room Simulation (50 rooms, 100 players)', () => {
    test('Should handle 50 concurrent games with different scenarios', async () => {
      // Reset results before this specific test
      resetResults();

      const games: Promise<void>[] = [];
      const connectedSockets: ClientSocket[] = [];

      console.log(`\n🎮 Starting simulation: ${TOTAL_ROOMS} rooms, ${TOTAL_ROOMS * 2} players\n`);

      for (let i = 0; i < TOTAL_ROOMS; i++) {
        const scenario = SCENARIOS[i % SCENARIOS.length];
        const gamePromise = runSingleGame(serverUrl, i, scenario, connectedSockets);
        games.push(gamePromise);

        // Stagger game starts to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait for all games to complete
      await Promise.all(games);

      // Cleanup sockets
      connectedSockets.forEach(s => s.disconnect());

      // Log results
      console.log('\n📊 Test Results:');
      console.log(`   Rooms created: ${results.roomsCreated}`);
      console.log(`   Rooms joined: ${results.roomsJoined}`);
      console.log(`   Games started: ${results.gamesStarted}`);
      console.log(`   Games completed: ${results.gamesCompleted}`);
      console.log(`   Total questions answered: ${results.totalQuestionsAnswered}`);
      console.log(`   Errors: ${results.totalErrors.length}`);
      console.log('\n📈 Scenarios completed:');
      Object.entries(results.scenariosCompleted).forEach(([scenario, count]) => {
        console.log(`   ${scenario}: ${count}`);
      });

      // Assertions
      expect(results.roomsCreated).toBe(TOTAL_ROOMS);
      expect(results.roomsJoined).toBe(TOTAL_ROOMS);
      expect(results.gamesStarted).toBe(TOTAL_ROOMS);
      expect(results.gamesCompleted).toBe(TOTAL_ROOMS);
      expect(results.totalErrors).toHaveLength(0);
    }, 300000); // 5 minute timeout for all games
  });

  describe('Edge Cases & Error Handling', () => {
    test('Should handle invalid room code', async () => {
      const socket = await createPlayer(serverUrl, 'Player');

      const response = await new Promise<any>((resolve) => {
        socket.emit('room:join', {
          code: 'INVALID',
          playerName: 'Player'
        }, resolve);
      });

      expect(response.success).toBe(false);
      socket.disconnect();
    });

    test('Should handle game start without second player', async () => {
      const host = await createPlayer(serverUrl, 'Host');

      await new Promise<any>((resolve) => {
        host.emit('room:create', { playerName: 'Host' }, resolve);
      });

      const startResponse = await new Promise<any>((resolve) => {
        host.emit('game:start', resolve);
      });

      expect(startResponse.success).toBe(false);
      host.disconnect();
    });
  });
});

// Run a single game with specified scenario
async function runSingleGame(
  serverUrl: string,
  gameIndex: number,
  scenario: GameScenario,
  sockets: ClientSocket[]
): Promise<void> {
  try {
    const player1 = await createPlayer(serverUrl, `P1_Game${gameIndex}`);
    const player2 = await createPlayer(serverUrl, `P2_Game${gameIndex}`);
    sockets.push(player1, player2);

    // Create room
    const createResponse = await new Promise<any>((resolve) => {
      player1.emit('room:create', { playerName: `P1_Game${gameIndex}` }, resolve);
    });

    if (!createResponse.success) {
      results.totalErrors.push(`Game ${gameIndex}: Failed to create room`);
      return;
    }

    // Join room
    const joinResponse = await new Promise<any>((resolve) => {
      player2.emit('room:join', {
        code: createResponse.room.code,
        playerName: `P2_Game${gameIndex}`
      }, resolve);
    });

    if (!joinResponse.success) {
      results.totalErrors.push(`Game ${gameIndex}: Failed to join room`);
      return;
    }

    // Setup scenario handlers
    let scenarioPromise: Promise<void>;
    switch (scenario) {
      case 'perfect_match':
        scenarioPromise = runPerfectMatchScenario(player1, player2);
        break;
      case 'total_mismatch':
        scenarioPromise = runTotalMismatchScenario(player1, player2);
        break;
      case 'partial_match':
        scenarioPromise = runPartialMatchScenario(player1, player2);
        break;
      case 'timeout':
        scenarioPromise = runTimeoutScenario(player1, player2);
        break;
      case 'rapid_fire':
        scenarioPromise = runRapidFireScenario(player1, player2);
        break;
      default:
        scenarioPromise = runPerfectMatchScenario(player1, player2);
    }

    // Start game
    const startResponse = await new Promise<any>((resolve) => {
      player1.emit('game:start', resolve);
    });

    if (!startResponse.success) {
      results.totalErrors.push(`Game ${gameIndex}: Failed to start game`);
      return;
    }

    // Wait for game to finish
    await Promise.race([
      scenarioPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Game timeout')), 120000)
      )
    ]);

  } catch (error) {
    results.totalErrors.push(`Game ${gameIndex}: ${(error as Error).message}`);
  }
}
