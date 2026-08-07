import { Server, Socket } from 'socket.io';
import type {
  Room,
  Question,
  QuestionType,
  ServerToClientEvents,
  ClientToServerEvents,
  GameRevealData,
  GameFinishedData,
  CategoryScore,
  ReactionEmoji,
  TextReactionId,
  SoundReactionId,
  QuickMessageId
} from '../types.js';
import { REACTION_EMOJIS, TEXT_REACTIONS, SOUND_REACTIONS, QUICK_MESSAGES } from '../types.js';
import * as roomModel from '../models/room.js';
import * as gameModel from '../models/game.js';
import * as questionModel from '../models/question.js';
import * as categoryModel from '../models/category.js';
import { getGameMode, listGameModes } from './gameModes.js';
import type { ModeDecision } from './gameModes.js';

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

interface QuestionHistoryItem {
  question: Question;
  answer1: string | null;
  answer2: string | null;
  correct: boolean;
  points1: number;
  points2: number;
}

interface GameState {
  gameId: number;
  roomId: number;
  questions: Question[];
  currentQuestionIndex: number;
  currentQuestion: Question | null; // The prepared question currently being played (with substitutions done)
  answers: Map<number, AnswerData>;
  scores: { player1: number; player2: number };
  timer: NodeJS.Timeout | null;
  phase: 'question' | 'waiting' | 'reveal';
  questionStartTime: number;
  gamification: GamificationState;
  questionHistory: QuestionHistoryItem[];
  // Pause/resume state
  paused: boolean;
  manualPause: boolean;
  pausedAt: number | null;
  remainingTime: number | null;
  connectedPlayers: Set<1 | 2>;
  disconnectedPlayerName: string | null;
  // Grace period for reconnection (don't pause immediately) - per-player timers
  disconnectGraceTimers: Map<1 | 2, ReturnType<typeof setTimeout>>;
  // Timer for next question (to cancel on pause)
  nextQuestionTimer: ReturnType<typeof setTimeout> | null;
  // Kiss counter for the game
  kissCount?: { player1: number; player2: number };
  // --- Mode duel ---
  // Gagnant de la manche qui vient de s'achever (null si egalite parfaite).
  roundWinner: 1 | 2 | null;
  roundWinners: (1 | 2 | null)[];
  roundAgreements: boolean[];
  // Joueur a qui l'on a rendu la main pour choisir le theme suivant.
  awaitingThemeFrom: 1 | 2 | null;
  // Filet de securite : si le joueur ne choisit pas, on tire un theme au sort.
  themeChoiceTimer: ReturnType<typeof setTimeout> | null;
}

interface PlayerConnection {
  socket: Socket;
  roomCode: string;
  playerId: 1 | 2;
}

const activeGames = new Map<string, GameState>();
const playerConnections = new Map<string, PlayerConnection>();
const roomSettings = new Map<string, { questionCount: number; categories: string[]; questionTypes: string[]; gameMode: string }>();

// Changement de mode en cours de partie : proposition en attente de validation.
// Un seul echange a la fois par salon, avec expiration pour ne pas laisser
// l'autre joueur bloque sur une demande jamais tranchee.
const MODE_PROPOSAL_TIMEOUT_SECONDS = 30;
const pendingModeProposals = new Map<string, {
  mode: string;
  from: 1 | 2;
  timer: ReturnType<typeof setTimeout>;
}>();

const DEFAULT_QUESTION_COUNT = 10;

// Constants for gamification
const BASE_POINTS = 100;
const SPEED_BONUS_THRESHOLD_FAST = 5;  // seconds for 25% bonus
const SPEED_BONUS_THRESHOLD_MEDIUM = 10;  // seconds for 10% bonus
const SPEED_BONUS_FAST = 0.25;  // 25% bonus
const SPEED_BONUS_MEDIUM = 0.10;  // 10% bonus
// Seuils exprimes en fraction du temps alloue a la question (cf. calculateSpeedBonus)
const SPEED_BONUS_RATIO_FAST = 0.3;    // repondu dans le premier tiers du temps
const SPEED_BONUS_RATIO_MEDIUM = 0.6;  // repondu avant les deux tiers du temps
const STREAK_MULTIPLIERS: Record<number, number> = {
  2: 1.2,   // 2 streak = 20% bonus
  3: 1.5,   // 3 streak = 50% bonus
  4: 1.75,  // 4 streak = 75% bonus
  5: 2.0,   // 5+ streak = 100% bonus (2x)
};
const TYPE_C_THOUGHTFUL_BONUS = 50;  // Bonus for answers > 20 chars
const JOKER_PENALTY = -50;  // Penalty for using joker

// Echelle 1-10 (types D et Q) : bareme degressif indexe par l'ecart entre les
// deux reponses. Un ecart de 5 ou plus ne figure pas dans la table => 0 point.
const SCALE_POINTS_BY_DIFF: Record<number, number> = {
  0: 100,  // meme note
  1: 80,
  2: 60,
  3: 40,
  4: 20,
};
// Au-dela de cet ecart, les points restent partiels mais la reponse n'est plus
// presentee comme un accord (pas d'animation de match).
const SCALE_CORRECT_MAX_DIFF = 2;

// Type F : valeurs envoyees par le selecteur "Qui de nous deux"
const PLAYER_BOTH = 'both';
const PLAYER_UNKNOWN = 'dontknow';
const PARTIAL_AGREEMENT_POINTS = 40;  // "Nous deux" face a une personne precise

// Type C : les questions ouvertes n'ont pas de bonne reponse, mais y repondre
// tous les deux vaut mieux que zero point.
const OPEN_ANSWER_POINTS = 25;
const NO_ANSWER_PENALTY = -50;  // Penalty for not answering
const UNLIMITED_MODE_QUESTION_COUNT = 50;  // When set to 50, it's unlimited
const UNLIMITED_MODE_GAP_TO_WIN = 200;  // 200 point gap to win in unlimited

export function setupSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Create room
    socket.on('room:create', (data, callback) => {
      try {
        const room = roomModel.createRoom(data.playerName, data.gender);
        socket.join(room.code);

        playerConnections.set(socket.id, {
          socket,
          roomCode: room.code,
          playerId: 1
        });

        // Store room settings (question count, categories, and question types)
        const questionCount = data.questionCount && data.questionCount >= 5 && data.questionCount <= 50
          ? data.questionCount
          : DEFAULT_QUESTION_COUNT;
        // If no categories specified or empty array, use all categories (auto mode)
        const categories = data.categories && data.categories.length > 0 ? data.categories : [];
        // If no question types specified or empty array, use all types (auto mode)
        const questionTypes = data.questionTypes && data.questionTypes.length > 0 ? data.questionTypes : [];
        // Valide contre le registre, pas contre une liste en dur : l'ancienne
        // version (=== 'duel' ? 'duel' : 'classic') degradait silencieusement
        // 6 des 8 modes en "classic" — constat de l'audit d'architecture.
        const gameMode = listGameModes().some(m => m.id === data.gameMode)
          ? (data.gameMode as string)
          : 'classic';
        roomSettings.set(room.code, { questionCount, categories, questionTypes, gameMode });

        callback({ success: true, room, playerId: 1 });
      } catch (error) {
        callback({ success: false, error: 'Failed to create room' });
      }
    });

    // Join room
    socket.on('room:join', (data, callback) => {
      try {
        const room = roomModel.joinRoom(data.code, data.playerName, data.gender);

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
          playerId: 2,
          gender: data.gender
        });

        callback({ success: true, room, playerId: 2 });
      } catch (error) {
        callback({ success: false, error: 'Failed to join room' });
      }
    });

    // Reconnect to room
    socket.on('room:reconnect', (data, callback) => {
      try {
        // Validate input
        if (!data.code || !data.playerId || (data.playerId !== 1 && data.playerId !== 2)) {
          callback({ success: false, error: 'Invalid reconnection data' });
          return;
        }

        const room = roomModel.getRoomByCode(data.code);

        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        // Check if room is finished - don't allow reconnection to finished rooms
        if (room.status === 'finished') {
          callback({ success: false, error: 'Game already finished' });
          return;
        }

        // Validate that the player slot exists in the room
        const playerName = data.playerId === 1 ? room.player1_name : room.player2_name;
        if (!playerName) {
          callback({ success: false, error: 'Player slot not found in room' });
          return;
        }

        socket.join(room.code);

        // Clean up stale connections for the same player in the same room
        for (const [oldSocketId, conn] of playerConnections.entries()) {
          if (conn.roomCode === room.code && conn.playerId === data.playerId && oldSocketId !== socket.id) {
            console.log('Cleaning up stale connection for player', data.playerId, 'socket', oldSocketId);
            // Also leave the socket room for the old connection
            const oldSocket = conn.socket;
            if (oldSocket) {
              oldSocket.leave(room.code);
            }
            playerConnections.delete(oldSocketId);
          }
        }

        playerConnections.set(socket.id, {
          socket,
          roomCode: room.code,
          playerId: data.playerId
        });

        roomModel.updateRoomActivity(room.id);

        // Check if game is active - include game info in response
        const gameState = activeGames.get(room.code);

        callback({ success: true, room, playerId: data.playerId });

        // Notify the other player
        socket.to(room.code).emit('room:player-joined', {
          playerName: data.playerId === 1 ? room.player1_name! : room.player2_name!,
          playerId: data.playerId,
          gender: data.playerId === 1 ? room.player1_gender! : room.player2_gender!
        });

        // If game is active, send current game state to reconnected player
        if (gameState) {
          // Send game:started so the frontend knows a game is in progress
          socket.emit('game:started', { gameId: gameState.gameId, gameMode: (roomSettings.get(data.code)?.gameMode ?? 'classic') as never });

          // Send current scores
          socket.emit('game:score-update', {
            score1: gameState.scores.player1,
            score2: gameState.scores.player2
          });

          // Send current question if available (for question or reveal phase)
          if (gameState.currentQuestion) {
            socket.emit('game:question', {
              question: gameState.currentQuestion,
              questionNumber: gameState.currentQuestionIndex + 1,
              totalQuestions: gameState.questions.length
            });
          }

          // If in reveal phase, send the reveal data
          if (gameState.phase === 'reveal') {
            const question = gameState.questions[gameState.currentQuestionIndex];
            const answers = gameState.answers.get(question.id) || {};
            // Re-send the latest reveal data from history if available
            const lastHistory = gameState.questionHistory[gameState.questionHistory.length - 1];
            if (lastHistory) {
              // Reconstruct minimal reveal data for display
              socket.emit('game:reveal', {
                questionId: question.id,
                answer1: answers.answer1 || null,
                answer2: answers.answer2 || null,
                correct: lastHistory.correct,
                points1: lastHistory.points1,
                points2: lastHistory.points2,
                questionType: question.type,
                basePoints: 0,
                speedBonus1: 0,
                speedBonus2: 0,
                streakBonus1: 0,
                streakBonus2: 0,
                streak1: gameState.gamification.streak1,
                streak2: gameState.gamification.streak2,
                answerTime1: null,
                answerTime2: null,
                category: question.category,
                correctAnswer: question.type === 'H' ? question.correct_answer : undefined
              });
            }
          }
        }

        // Handle reconnection - either during grace period or after pause
        if (gameState) {
          // Mark player as connected
          gameState.connectedPlayers.add(data.playerId);

          const playerName = data.playerId === 1 ? room.player1_name : room.player2_name;

          // Cancel any pending grace timer for this player (reconnected quickly)
          const graceTimer = gameState.disconnectGraceTimers.get(data.playerId);
          if (graceTimer) {
            clearTimeout(graceTimer);
            gameState.disconnectGraceTimers.delete(data.playerId);
            console.log('Player', playerName, 'reconnected within grace period - no pause needed');
          }

          // Resume if game was paused due to disconnect (not manual pause)
          if (gameState.paused && !gameState.manualPause) {
            console.log('Player', playerName, 'reconnected to room', room.code, '- resuming game');

            gameState.paused = false;
            gameState.disconnectedPlayerName = null;

            // Notify all players that game is resumed
            io.to(room.code).emit('game:resumed', {
              reconnectedPlayer: data.playerId,
              playerName: playerName || 'Joueur'
            });

            // Scores and question already sent above before pause check

            // Resume the timer if we were in question phase
            if (gameState.phase === 'question' && gameState.remainingTime !== null && gameState.currentQuestion) {
              // Clear any existing timer before setting a new one
              if (gameState.timer) {
                clearTimeout(gameState.timer);
                gameState.timer = null;
              }

              // Restart timer with remaining time
              const remainingMs = gameState.remainingTime * 1000;
              gameState.questionStartTime = Date.now() - ((gameState.currentQuestion.timer - gameState.remainingTime) * 1000);
              gameState.remainingTime = null;

              gameState.timer = setTimeout(() => {
                revealAnswers(io, room.code, gameState);
              }, remainingMs + 3000); // Extra 3 seconds for network latency
            }
            // If in reveal phase, we need to schedule the next question since the timer was cleared
            else if (gameState.phase === 'reveal') {
              console.log('Resuming from reveal phase - scheduling next question');
              scheduleNextQuestion(io, room.code, gameState);
            }
          } else if (gameState.paused && gameState.manualPause) {
            // Game is manually paused - inform the reconnecting player
            console.log('Player', playerName, 'reconnected but game is manually paused');
            socket.emit('game:paused', {
              disconnectedPlayer: data.playerId,
              playerName: (gameState.disconnectedPlayerName || 'Pause')
            });
          }
        }
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
      console.log('[GAME:START] Received game:start event');
      const connection = playerConnections.get(socket.id);
      if (!connection) {
        console.log('[GAME:START] ERROR: No connection found');
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      // Check if game already exists for this room (prevent double start)
      if (activeGames.has(connection.roomCode)) {
        console.log('[GAME:START] ERROR: Game already exists for room', connection.roomCode);
        callback({ success: false, error: 'Game already started' });
        return;
      }
      console.log('[GAME:START] Starting game for room', connection.roomCode);

      const room = roomModel.getRoomByCode(connection.roomCode);
      if (!room || !room.player1_name || !room.player2_name) {
        callback({ success: false, error: 'Room not ready' });
        return;
      }

      if (connection.playerId !== 1) {
        callback({ success: false, error: 'Only host can start the game' });
        return;
      }

      // Get mixed questions based on room settings (ensures variety of question types)
      const settings = roomSettings.get(connection.roomCode);
      const questionCount = settings?.questionCount || DEFAULT_QUESTION_COUNT;
      const categories = settings?.categories || [];
      const questionTypes = settings?.questionTypes || [];
      // Chaque mode decide de son amorcage : le classique charge toute la liste,
      // les modes en boucle n'en chargent qu'une et tirent la suite au fil des manches.
      const startMode = getGameMode(settings?.gameMode);
      const initialCount = startMode.initialQuestionCount({ questionCount, categories, questionTypes });
      const questions = questionModel.getMixedQuestions(initialCount, categories, questionTypes);
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
        currentQuestion: null,
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
        },
        questionHistory: [],
        // Etat consomme par le registre de modes (gameModes.ts)
        roundWinner: null,
        roundWinners: [],
        roundAgreements: [],
        awaitingThemeFrom: null,
        themeChoiceTimer: null,
        // Pause/resume state - both players connected at start
        paused: false,
        manualPause: false,
        pausedAt: null,
        remainingTime: null,
        connectedPlayers: new Set([1, 2]),
        disconnectedPlayerName: null,
        disconnectGraceTimers: new Map(),
        nextQuestionTimer: null
      };

      activeGames.set(room.code, gameState);

      // Notify both players
      io.to(room.code).emit('game:started', { gameId: game.id, gameMode: (settings?.gameMode ?? 'classic') as never });

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
      if (!gameState) return;

      console.log(`[ANSWER] Player ${connection.playerId} answering - Room: ${connection.roomCode}, Phase: ${gameState.phase}, Question: ${gameState.currentQuestionIndex + 1}`);

      // Only accept answers in question phase
      if (gameState.phase !== 'question') {
        console.log(`[ANSWER] REJECTED - Phase is ${gameState.phase}, not question`);
        return;
      }

      // Don't accept answers if game is paused
      if (gameState.paused) {
        console.log('[ANSWER] REJECTED - Game paused');
        return;
      }

      const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
      const answerTime = Date.now();

      // Save answer with timestamp
      const questionAnswers = gameState.answers.get(currentQuestion.id) || {};

      // Prevent duplicate answers from same player
      if (connection.playerId === 1 && questionAnswers.answer1 !== undefined) {
        console.log('[ANSWER] REJECTED - Duplicate from player 1');
        return;
      }
      if (connection.playerId === 2 && questionAnswers.answer2 !== undefined) {
        console.log('[ANSWER] REJECTED - Duplicate from player 2');
        return;
      }
      console.log(`[ANSWER] ACCEPTED - Player ${connection.playerId}, answer: ${data.answer?.substring(0, 20)}...`);

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

      // Check if both players have answered (double-check phase to avoid race)
      if (gameState.phase === 'question' &&
          questionAnswers.answer1 !== undefined &&
          questionAnswers.answer2 !== undefined) {
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

      // Clean up any existing game state for this room - CLEAR ALL TIMERS FIRST
      const existingGame = activeGames.get(connection.roomCode);
      if (existingGame) {
        if (existingGame.timer) {
          clearTimeout(existingGame.timer);
        }
        if (existingGame.nextQuestionTimer) {
          clearTimeout(existingGame.nextQuestionTimer);
        }
        for (const timer of existingGame.disconnectGraceTimers.values()) {
          clearTimeout(timer);
        }
        existingGame.disconnectGraceTimers.clear();
      }
      activeGames.delete(connection.roomCode);

      // Notify both players to go back to lobby
      io.to(connection.roomCode).emit('game:restarted');

      callback({ success: true });
    });

    // Send reaction emoji to partner
    // Manual pause/resume requested by a player
    // Mode duel : le gagnant de la manche choisit le theme suivant.
    // Un joueur propose de basculer sur un autre jeu, sans quitter la partie.
    socket.on('mode:propose', (data: { mode: string }) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;
      const { roomCode, playerId } = connection;
      if (!data || typeof data.mode !== 'string') return;

      const target = listGameModes().find(m => m.id === data.mode);
      if (!target) return;                                   // mode inconnu
      const settings = roomSettings.get(roomCode);
      if (!settings || settings.gameMode === target.id) return;  // deja actif
      if (pendingModeProposals.has(roomCode)) return;        // une seule a la fois

      const room = roomModel.getRoomByCode(roomCode);
      const fromName = (playerId === 1 ? room?.player1_name : room?.player2_name) || `Joueur ${playerId}`;

      const timer = setTimeout(() => {
        pendingModeProposals.delete(roomCode);
      }, MODE_PROPOSAL_TIMEOUT_SECONDS * 1000);
      pendingModeProposals.set(roomCode, { mode: target.id, from: playerId, timer });

      for (const [, conn] of playerConnections) {
        if (conn.roomCode !== roomCode || conn.playerId === playerId) continue;
        conn.socket.emit('mode:proposal', {
          mode: target.id as never,
          label: target.label,
          icon: target.icon,
          fromPlayerId: playerId,
          fromName,
          timeoutSeconds: MODE_PROPOSAL_TIMEOUT_SECONDS,
        });
      }
    });

    // Le partenaire tranche. Seul le destinataire peut repondre.
    socket.on('mode:respond', (data: { accept: boolean }) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;
      const { roomCode, playerId } = connection;
      const pending = pendingModeProposals.get(roomCode);
      if (!pending || pending.from === playerId) return;

      clearTimeout(pending.timer);
      pendingModeProposals.delete(roomCode);

      const room = roomModel.getRoomByCode(roomCode);
      const byName = (playerId === 1 ? room?.player1_name : room?.player2_name) || `Joueur ${playerId}`;

      if (!data?.accept) {
        for (const [, conn] of playerConnections) {
          if (conn.roomCode === roomCode && conn.playerId === pending.from) {
            conn.socket.emit('mode:declined', { byName });
          }
        }
        return;
      }

      const settings = roomSettings.get(roomCode);
      if (!settings) return;
      settings.gameMode = pending.mode;
      roomSettings.set(roomCode, settings);

      const def = listGameModes().find(m => m.id === pending.mode)!;
      io.to(roomCode).emit('mode:changed', {
        mode: def.id as never,
        label: def.label,
        icon: def.icon,
      });
      // Le nouveau mode s'applique des la manche suivante : la question en
      // cours reste valable, on n'interrompt pas les joueurs en plein tour.
    });

    socket.on('duel:choose-theme', (data: { category: string }) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;
      const gameState = activeGames.get(connection.roomCode);
      if (!gameState) return;
      // Seul le joueur a qui l'on a rendu la main peut choisir, et une seule fois.
      if (gameState.awaitingThemeFrom !== connection.playerId) return;
      if (!data || typeof data.category !== 'string') return;
      if (!categoryModel.getCategoryByCode(data.category)) return;
      resolveThemeChoice(io, connection.roomCode, gameState, data.category, false);
    });

    socket.on('game:request-pause', (callback) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) { callback?.({ success: false }); return; }

      const gameState = activeGames.get(connection.roomCode);
      if (!gameState) { callback?.({ success: false }); return; }

      if (gameState.paused) {
        // Resume the game
        gameState.paused = false;
        gameState.disconnectedPlayerName = null;
        gameState.manualPause = false;

        // Resume timer if in question phase
        if (gameState.phase === 'question' && gameState.remainingTime !== null && gameState.currentQuestion) {
          if (gameState.timer) { clearTimeout(gameState.timer); gameState.timer = null; }
          const remainingMs = gameState.remainingTime * 1000;
          gameState.questionStartTime = Date.now() - ((gameState.currentQuestion.timer - gameState.remainingTime) * 1000);
          gameState.remainingTime = null;
          gameState.timer = setTimeout(() => {
            revealAnswers(io, connection.roomCode, gameState);
          }, remainingMs);
        } else if (gameState.phase === 'reveal') {
          scheduleNextQuestion(io, connection.roomCode, gameState);
        }

        io.to(connection.roomCode).emit('game:resumed', {
          reconnectedPlayer: connection.playerId,
          playerName: 'le jeu'
        });
        callback?.({ success: true, paused: false });
      } else {
        // Pause the game
        gameState.paused = true;
        gameState.manualPause = true;

        // Freeze timers
        if (gameState.timer) { clearTimeout(gameState.timer); gameState.timer = null; }
        if (gameState.nextQuestionTimer) { clearTimeout(gameState.nextQuestionTimer); gameState.nextQuestionTimer = null; }

        // Save remaining time
        if (gameState.phase === 'question') {
          const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
          const elapsed = (Date.now() - gameState.questionStartTime) / 1000;
          gameState.remainingTime = Math.max(0, currentQuestion.timer - elapsed);
        }

        const room = roomModel.getRoomByCode(connection.roomCode);
        const playerName = room
          ? (connection.playerId === 1 ? room.player1_name : room.player2_name) || 'Joueur'
          : 'Joueur';

        io.to(connection.roomCode).emit('game:paused', {
          disconnectedPlayer: connection.playerId,
          playerName: playerName + ' a mis en pause'
        });
        callback?.({ success: true, paused: true });
      }
    });

    socket.on('game:reaction', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      // Validate emoji
      if (!REACTION_EMOJIS.includes(data.emoji as ReactionEmoji)) return;

      // Broadcast reaction to the room (including sender for their own visual feedback)
      io.to(connection.roomCode).emit('game:reaction', {
        playerId: connection.playerId,
        emoji: data.emoji as ReactionEmoji,
        timestamp: Date.now()
      });
    });

    // Send text reaction to partner
    socket.on('game:text-reaction', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      // Find the text reaction
      const reaction = TEXT_REACTIONS.find(r => r.id === data.reactionId);
      if (!reaction) return;

      // Broadcast text reaction to the room
      io.to(connection.roomCode).emit('game:text-reaction', {
        playerId: connection.playerId,
        reactionId: data.reactionId as TextReactionId,
        text: reaction.text,
        emoji: reaction.emoji,
        timestamp: Date.now()
      });
    });

    // Sound reactions (klaxon, applause, etc.)
    socket.on('game:sound-reaction', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      // Validate sound reaction
      const reaction = SOUND_REACTIONS.find(r => r.id === data.reactionId);
      if (!reaction) return;

      // Broadcast sound reaction to the room
      io.to(connection.roomCode).emit('game:sound-reaction', {
        playerId: connection.playerId,
        reactionId: data.reactionId as SoundReactionId,
        timestamp: Date.now()
      });
    });

    // Quick predefined messages
    socket.on('game:quick-message', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      const message = QUICK_MESSAGES.find(m => m.id === data.messageId);
      if (!message) return;

      io.to(connection.roomCode).emit('game:quick-message', {
        playerId: connection.playerId,
        messageId: data.messageId as QuickMessageId,
        text: message.text,
        emoji: message.emoji,
        timestamp: Date.now()
      });
    });

    // Buzz - vibrate partner's phone
    socket.on('game:buzz', () => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      io.to(connection.roomCode).emit('game:buzz', {
        fromPlayerId: connection.playerId,
        timestamp: Date.now()
      });
    });

    // Hesitation indicator
    socket.on('game:hesitation', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      socket.to(connection.roomCode).emit('game:hesitation', {
        playerId: connection.playerId,
        isHesitating: data.isHesitating
      });
    });

    // Kiss with counter
    socket.on('game:kiss', () => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      const gameState = activeGames.get(connection.roomCode);
      if (!gameState) return;

      // Initialize kiss counter if needed
      if (!gameState.kissCount) {
        gameState.kissCount = { player1: 0, player2: 0 };
      }

      // Increment kiss count
      if (connection.playerId === 1) {
        gameState.kissCount.player1++;
      } else {
        gameState.kissCount.player2++;
      }

      const totalKisses = gameState.kissCount.player1 + gameState.kissCount.player2;

      io.to(connection.roomCode).emit('game:kiss', {
        fromPlayerId: connection.playerId,
        totalKisses,
        timestamp: Date.now()
      });
    });

    // Lobby chat
    socket.on('lobby:chat', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;

      // Get room to find player name
      const room = roomModel.getRoomByCode(connection.roomCode);
      if (!room) return;

      const playerName = connection.playerId === 1 ? room.player1_name : room.player2_name;
      if (!playerName) return;

      // Sanitize message (limit length, trim)
      const message = data.message.trim().slice(0, 200);
      if (!message) return;

      // Broadcast chat message to the room
      io.to(connection.roomCode).emit('lobby:chat', {
        id: `${Date.now()}-${connection.playerId}-${Math.random().toString(36).slice(2, 8)}`,
        playerId: connection.playerId,
        playerName,
        message,
        timestamp: Date.now()
      });
    });

    // Voice chat signaling - relay WebRTC messages to partner
    socket.on('voice:offer', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;
      // Send to the other player in the room
      socket.to(connection.roomCode).emit('voice:offer', data);
    });

    socket.on('voice:answer', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;
      socket.to(connection.roomCode).emit('voice:answer', data);
    });

    socket.on('voice:ice-candidate', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;
      socket.to(connection.roomCode).emit('voice:ice-candidate', data);
    });

    // Talkie-walkie : on relaie l'appui / le relachement au partenaire.
    // Le flux audio lui-meme passe par WebRTC en pair a pair ; le serveur ne
    // transporte que l'indication "je parle", pour l'affichage et le bip.
    socket.on('voice:ptt', (data: { speaking: boolean }) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;
      socket.to(connection.roomCode).emit('voice:peer-ptt', {
        playerId: connection.playerId,
        speaking: !!data?.speaking
      });
    });

    socket.on('voice:toggle', (data) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;
      // Notify partner that this player toggled their voice
      socket.to(connection.roomCode).emit('voice:peer-toggle', {
        playerId: connection.playerId,
        enabled: data.enabled
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      handleDisconnect(socket, io);
    });
  });
}

// Grace period before pausing (5 seconds)
const DISCONNECT_GRACE_PERIOD = 5000;

function handleDisconnect(
  socket: Socket,
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  const connection = playerConnections.get(socket.id);
  if (!connection) return;

  console.log('Player disconnected:', socket.id, 'from room:', connection.roomCode);

  // Handle game pause with grace period
  const gameState = activeGames.get(connection.roomCode);

  // Only notify room:player-left when NOT in an active game
  // During a game, the pause/resume system handles disconnect display
  if (!gameState) {
    // Get the room to check if it's in lobby state
    const room = roomModel.getRoomByCode(connection.roomCode);
    if (room && room.status === 'waiting') {
      // In lobby - remove player from room in database so slot can be taken by someone else
      roomModel.removePlayerFromRoom(room.id, connection.playerId);
      console.log('Removed player', connection.playerId, 'from room', room.code, 'in database (lobby state)');
    }
    socket.to(connection.roomCode).emit('room:player-left', {
      playerId: connection.playerId
    });
  }
  if (gameState && !gameState.paused) {
    // Mark player as temporarily disconnected
    gameState.connectedPlayers.delete(connection.playerId);

    // Get room to find player name
    const room = roomModel.getRoomByCode(connection.roomCode);
    const playerName = room
      ? (connection.playerId === 1 ? room.player1_name : room.player2_name) || 'Joueur'
      : 'Joueur';

    // Clear any existing grace timer for this specific player
    const existingTimer = gameState.disconnectGraceTimers.get(connection.playerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    console.log('Player', playerName, 'disconnected, starting grace period...');

    // Start grace period - only pause if they don't reconnect within 5 seconds
    const graceTimer = setTimeout(() => {
      // Check if game still exists and player still disconnected
      const currentGameState = activeGames.get(connection.roomCode);
      if (!currentGameState || currentGameState.paused) return;
      if (currentGameState.connectedPlayers.has(connection.playerId)) return;

      // Grace period expired - now actually pause
      currentGameState.paused = true;
      currentGameState.pausedAt = Date.now();
      currentGameState.disconnectedPlayerName = playerName;
      currentGameState.disconnectGraceTimers.delete(connection.playerId);

      // Clear ALL timers when pausing
      if (currentGameState.timer) {
        clearTimeout(currentGameState.timer);
        currentGameState.timer = null;
      }
      if (currentGameState.nextQuestionTimer) {
        clearTimeout(currentGameState.nextQuestionTimer);
        currentGameState.nextQuestionTimer = null;
      }

      // Calculate remaining time if in question phase
      if (currentGameState.phase === 'question') {
        const currentQuestion = currentGameState.questions[currentGameState.currentQuestionIndex];
        const elapsed = (Date.now() - currentGameState.questionStartTime) / 1000;
        currentGameState.remainingTime = Math.max(0, currentQuestion.timer - elapsed);
      }

      console.log('Game FULLY paused in room', connection.roomCode, '- all timers cleared, waiting for', playerName);

      // Notify the other player that the game is paused
      io.to(connection.roomCode).emit('game:paused', {
        disconnectedPlayer: connection.playerId,
        playerName
      });
    }, DISCONNECT_GRACE_PERIOD);
    gameState.disconnectGraceTimers.set(connection.playerId, graceTimer);
  }

  // Clean up connection
  playerConnections.delete(socket.id);
  socket.leave(connection.roomCode);
}

function sendQuestion(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  gameState: GameState
) {
  console.log(`[SEND_QUESTION] Room ${roomCode} - Question ${gameState.currentQuestionIndex + 1}/${gameState.questions.length} - Phase: ${gameState.phase}`);

  // Don't send question if game is paused
  if (gameState.paused) {
    console.log('[SEND_QUESTION] Game paused, skipping');
    return;
  }

  // Clear any existing question timer to prevent duplicates
  if (gameState.timer) {
    console.log('[SEND_QUESTION] Clearing existing timer');
    clearTimeout(gameState.timer);
    gameState.timer = null;
  }

  const question = { ...gameState.questions[gameState.currentQuestionIndex] };
  gameState.phase = 'question';
  gameState.questionStartTime = Date.now();
  console.log(`[SEND_QUESTION] Sending question ID ${question.id}, type ${question.type}`);

  // For Type G, assign a random target player and substitute {player} in the text
  if (question.type === 'G') {
    const room = roomModel.getRoomByCode(roomCode);
    if (room) {
      // Randomly pick player 1 or 2
      question.target_player = Math.random() < 0.5 ? 1 : 2;
      const targetName = question.target_player === 1 ? room.player1_name : room.player2_name;
      // Substitute {player} in the question text
      question.text = question.text.replace(/\{player\}/gi, targetName || 'Joueur');
    }
  }

  // Store the prepared question so it can be re-sent on reconnect
  gameState.currentQuestion = question;

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

/**
 * Bonus de rapidite, proportionnel au temps alloue a la question.
 * Des seuils fixes penalisaient les questions courtes : repondre en 6 s a une
 * question de 15 s est rapide, alors que c'est lent sur une question de 35 s.
 * On raisonne donc en fraction du temps imparti.
 */
function calculateSpeedBonus(
  answerTimeMs: number,
  questionStartTime: number,
  questionTimer: number
): number {
  const seconds = (answerTimeMs - questionStartTime) / 1000;
  // Garde-fou : sans timer exploitable, on retombe sur les anciens seuils absolus.
  if (!questionTimer || questionTimer <= 0) {
    if (seconds <= SPEED_BONUS_THRESHOLD_FAST) return SPEED_BONUS_FAST;
    if (seconds <= SPEED_BONUS_THRESHOLD_MEDIUM) return SPEED_BONUS_MEDIUM;
    return 0;
  }

  const ratio = seconds / questionTimer;
  if (ratio <= SPEED_BONUS_RATIO_FAST) {
    return SPEED_BONUS_FAST;
  } else if (ratio <= SPEED_BONUS_RATIO_MEDIUM) {
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
  console.log(`[REVEAL] Room ${roomCode} - Question ${gameState.currentQuestionIndex + 1} - Current phase: ${gameState.phase}`);

  // Prevent double reveal (race condition protection)
  if (gameState.phase === 'reveal') {
    console.log('[REVEAL] SKIPPED - Already in reveal phase');
    return;
  }

  // Clear any pending question timer
  if (gameState.timer) {
    console.log('[REVEAL] Clearing question timer');
    clearTimeout(gameState.timer);
    gameState.timer = null;
  }

  console.log('[REVEAL] Setting phase to reveal');
  gameState.phase = 'reveal';
  const question = gameState.questions[gameState.currentQuestionIndex];
  const answers = gameState.answers.get(question.id) || {};
  const { gamification } = gameState;

  // Check for joker, dontknow, and no answers
  const isJoker1 = answers.answer1 === 'joker';
  const isJoker2 = answers.answer2 === 'joker';
  const isDontKnow1 = answers.answer1 === 'dontknow';
  const isDontKnow2 = answers.answer2 === 'dontknow';
  const noAnswer1 = answers.answer1 === undefined;
  const noAnswer2 = answers.answer2 === undefined;

  // For scoring purposes, joker and dontknow are treated as no valid answer
  const effectiveAnswer1 = (isJoker1 || isDontKnow1) ? undefined : answers.answer1;
  const effectiveAnswer2 = (isJoker2 || isDontKnow2) ? undefined : answers.answer2;

  // Calculate base points using effective answers
  const baseResult = calculateBasePoints(
    question.type,
    effectiveAnswer1,
    effectiveAnswer2,
    question.correct_answer
  );

  let { basePoints, correct } = baseResult;

  // For Type H, use individual points
  const isTypeH = question.type === 'H';
  let individualPoints1 = isTypeH ? (baseResult.points1 || 0) : 0;
  let individualPoints2 = isTypeH ? (baseResult.points2 || 0) : 0;

  // Calculate answer times (seconds from question start)
  const answerTime1 = answers.time1
    ? (answers.time1 - gameState.questionStartTime) / 1000
    : null;
  const answerTime2 = answers.time2
    ? (answers.time2 - gameState.questionStartTime) / 1000
    : null;

  // Calculate speed bonuses (only if correct and not Type C)
  // Speed bonus is now SHARED - both players get the same bonus based on their combined speed
  // This encourages teamwork and removes advantage for first responder
  let speedBonus1 = 0;
  let speedBonus2 = 0;
  if (isTypeH) {
    // For Type H, speed bonus based on individual correctness (keep individual)
    if (individualPoints1 > 0 && answers.time1) {
      speedBonus1 = Math.round(individualPoints1 * calculateSpeedBonus(answers.time1, gameState.questionStartTime, question.timer));
    }
    if (individualPoints2 > 0 && answers.time2) {
      speedBonus2 = Math.round(individualPoints2 * calculateSpeedBonus(answers.time2, gameState.questionStartTime, question.timer));
    }
  } else if (correct && question.type !== 'C' && basePoints > 0) {
    // For matching questions, calculate shared speed bonus based on the SLOWER player's time
    // This encourages both to be fast, not just one
    if (answers.time1 && answers.time2) {
      // Use the slower time (when both answered) for fair bonus calculation
      const slowerTime = Math.max(answers.time1, answers.time2);
      const sharedSpeedBonus = Math.round(basePoints * calculateSpeedBonus(slowerTime, gameState.questionStartTime, question.timer));
      speedBonus1 = sharedSpeedBonus;
      speedBonus2 = sharedSpeedBonus;
    }
    // If only one answered, no speed bonus (need both to answer for bonus)
  }

  // Update streaks
  if (isTypeH) {
    // For Type H, individual streaks based on individual correctness
    if (individualPoints1 > 0) {
      gamification.streak1++;
    } else {
      gamification.streak1 = 0;
    }
    if (individualPoints2 > 0) {
      gamification.streak2++;
    } else {
      gamification.streak2 = 0;
    }
  } else if (correct && question.type !== 'C') {
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
  if (isTypeH) {
    // For Type H, individual streak bonuses
    if (individualPoints1 > 0) {
      const multiplier1 = getStreakMultiplier(gamification.streak1);
      if (multiplier1 > 1) {
        streakBonus1 = Math.round(individualPoints1 * (multiplier1 - 1));
      }
    }
    if (individualPoints2 > 0) {
      const multiplier2 = getStreakMultiplier(gamification.streak2);
      if (multiplier2 > 1) {
        streakBonus2 = Math.round(individualPoints2 * (multiplier2 - 1));
      }
    }
  } else if (correct && question.type !== 'C' && basePoints > 0) {
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
  let points1: number;
  let points2: number;
  if (isTypeH) {
    // For Type H, use individual points + bonuses
    points1 = individualPoints1 + speedBonus1 + streakBonus1;
    points2 = individualPoints2 + speedBonus2 + streakBonus2;
    basePoints = individualPoints1; // For reveal display, show player 1's base
  } else {
    points1 = basePoints + speedBonus1 + streakBonus1;
    points2 = basePoints + speedBonus2 + streakBonus2;
  }

  // Apply penalties for no answer (-50 points)
  if (noAnswer1 && !isJoker1) {
    points1 = NO_ANSWER_PENALTY;
    // Reset streak when no answer
    gamification.streak1 = 0;
  }
  if (noAnswer2 && !isJoker2) {
    points2 = NO_ANSWER_PENALTY;
    gamification.streak2 = 0;
  }

  // --- Resultat de la manche, consomme par le registre de modes -------------
  // Le gagnant est celui qui marque le plus ; a egalite de points, le plus
  // rapide l'emporte. Si aucun des deux ne se detache, la manche est nulle et
  // le mode decidera quoi faire (le duel alterne alors la main).
  let roundWinner: 1 | 2 | null = null;
  if (points1 > points2) {
    roundWinner = 1;
  } else if (points2 > points1) {
    roundWinner = 2;
  } else if (answers.time1 && answers.time2 && answers.time1 !== answers.time2) {
    roundWinner = answers.time1 < answers.time2 ? 1 : 2;
  }
  gameState.roundWinner = roundWinner;
  gameState.roundWinners.push(roundWinner);
  gameState.roundAgreements.push(correct);

  // Apply joker penalty (overrides no answer if both)
  if (isJoker1) {
    points1 = JOKER_PENALTY;
  }
  if (isJoker2) {
    points2 = JOKER_PENALTY;
  }

  // Anti-tie mechanism: Add micro-bonus (1-3 points) based on answer speed
  // Applies when both players would get the same score (positive or zero, but not negative)
  if (points1 === points2 && points1 >= 0 && answerTime1 !== null && answerTime2 !== null) {
    // Player who answered faster gets a small bonus (1-3 points based on time difference)
    const timeDiff = Math.abs(answerTime1 - answerTime2);
    const microBonus = Math.min(3, Math.max(1, Math.ceil(timeDiff)));
    if (answerTime1 < answerTime2) {
      points1 += microBonus;
    } else if (answerTime2 < answerTime1) {
      points2 += microBonus;
    } else {
      // If exactly same time (extremely rare), give slight edge to player 2 to avoid tie
      points2 += 1;
    }
  }
  // Also handle case where both players tie on negative/zero but one answered
  else if (points1 === points2 && (answerTime1 !== null || answerTime2 !== null)) {
    // Player who answered gets a small bonus
    if (answerTime1 !== null && answerTime2 === null) {
      points1 += 1;
    } else if (answerTime2 !== null && answerTime1 === null) {
      points2 += 1;
    }
  }

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
    category: question.category,
    correctAnswer: isTypeH ? question.correct_answer : undefined
  };

  io.to(roomCode).emit('game:reveal', revealData);

  // Send score update
  io.to(roomCode).emit('game:score-update', {
    score1: gameState.scores.player1,
    score2: gameState.scores.player2
  });

  // Add to question history
  gameState.questionHistory.push({
    question,
    answer1: answers.answer1 || null,
    answer2: answers.answer2 || null,
    correct,
    points1,
    points2
  });

  // Next question or finish
  scheduleNextQuestion(io, roomCode, gameState);
}

function scheduleNextQuestion(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  gameState: GameState
) {
  console.log(`[SCHEDULE] Room ${roomCode} - Scheduling next question from index ${gameState.currentQuestionIndex}`);

  // Don't schedule if game is paused - will be called when resumed
  if (gameState.paused) {
    console.log('[SCHEDULE] Game paused, not scheduling');
    return;
  }

  // Clear any existing timer
  if (gameState.nextQuestionTimer) {
    console.log('[SCHEDULE] Clearing existing nextQuestionTimer');
    clearTimeout(gameState.nextQuestionTimer);
  }

  console.log('[SCHEDULE] Setting timer for 10 seconds');
  gameState.nextQuestionTimer = setTimeout(() => {
    console.log(`[SCHEDULE] Timer fired - Room ${roomCode}`);
    gameState.nextQuestionTimer = null;

    // Double-check pause state (might have changed during timeout)
    if (gameState.paused) {
      console.log('[SCHEDULE] Game became paused, stopping');
      return;
    }

    gameState.currentQuestionIndex++;
    console.log(`[SCHEDULE] Incremented index to ${gameState.currentQuestionIndex}`);

    // Check if unlimited mode (question count = 50)
    const settings = roomSettings.get(roomCode);
    // L'enchainement n'est plus decide ici : chaque mode de jeu exprime sa
    // regle dans gameModes.ts, le moteur se contente d'executer la decision.
    // Ajouter un nouveau jeu de couple ne demande donc pas de toucher a la boucle.
    const mode = getGameMode(settings?.gameMode);
    const decision = mode.afterRound({
      roomCode,
      questionIndex: gameState.currentQuestionIndex,
      loadedQuestions: gameState.questions.length,
      scores: gameState.scores,
      roundWinner: gameState.roundWinner,
      roundWinners: gameState.roundWinners,
      roundAgreements: gameState.roundAgreements,
      settings: {
        questionCount: settings?.questionCount ?? DEFAULT_QUESTION_COUNT,
        categories: settings?.categories ?? [],
        questionTypes: settings?.questionTypes ?? [],
      },
    });

    applyModeDecision(io, roomCode, gameState, decision);
  }, 10000); // 10 seconds to view results
}

const THEME_CHOICE_TIMEOUT_SECONDS = 20;
const THEME_CHOICE_OPTIONS = 4;

/**
 * Rend la main a un joueur pour qu'il choisisse le theme de la manche suivante.
 * Un minuteur garantit que la partie repart meme si le joueur ne repond pas :
 * sans ce filet, une deconnexion au mauvais moment figerait le duel.
 */
function requestThemeChoice(
  io: Server,
  roomCode: string,
  gameState: GameState,
  chooser: 1 | 2
): void {
  const settings = roomSettings.get(roomCode);
  const allowed = settings?.categories ?? [];

  // On ne propose que des themes qui contiennent effectivement des questions.
  const stats = categoryModel.getCategoryStats();
  let pool = categoryModel.getActiveCategories()
    .filter(c => (stats[c.code] ?? 0) > 0)
    .filter(c => allowed.length === 0 || allowed.includes(c.code));

  if (pool.length === 0) {
    // Aucun theme exploitable : on enchaine sans choix plutot que de bloquer.
    applyModeDecision(io, roomCode, gameState, { action: 'load-more', count: 5 });
    return;
  }

  // Tirage sans remise pour varier les propositions d'une manche a l'autre.
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const options = shuffled.slice(0, THEME_CHOICE_OPTIONS).map(c => ({
    code: c.code,
    name: c.name,
    icon: c.icon,
    color: c.color,
    questionCount: stats[c.code] ?? 0,
  }));

  gameState.awaitingThemeFrom = chooser;

  const room = roomModel.getRoomByCode(roomCode);
  const chooserName = (chooser === 1 ? room?.player1_name : room?.player2_name) || `Joueur ${chooser}`;
  const reason: 'winner' | 'faster' | 'tiebreak' =
    gameState.roundWinner === chooser ? 'winner' : 'tiebreak';

  for (const [, conn] of playerConnections) {
    if (conn.roomCode !== roomCode) continue;
    if (conn.playerId === chooser) {
      conn.socket.emit('duel:choose-theme', {
        options,
        timeoutSeconds: THEME_CHOICE_TIMEOUT_SECONDS,
        roundNumber: gameState.currentQuestionIndex + 1,
      });
    } else {
      conn.socket.emit('duel:awaiting-theme', {
        chooserPlayerId: chooser,
        chooserName,
        reason,
        timeoutSeconds: THEME_CHOICE_TIMEOUT_SECONDS,
      });
    }
  }

  if (gameState.themeChoiceTimer) clearTimeout(gameState.themeChoiceTimer);
  gameState.themeChoiceTimer = setTimeout(() => {
    if (gameState.awaitingThemeFrom === null) return;   // deja choisi entre-temps
    const auto = options[Math.floor(Math.random() * options.length)];
    resolveThemeChoice(io, roomCode, gameState, auto.code, true);
  }, THEME_CHOICE_TIMEOUT_SECONDS * 1000);
}

/** Applique le theme retenu (choisi par le joueur ou tire au sort) et relance. */
function resolveThemeChoice(
  io: Server,
  roomCode: string,
  gameState: GameState,
  category: string,
  autoPicked: boolean
): void {
  const chooser = gameState.awaitingThemeFrom;
  if (chooser === null) return;   // garde-fou contre un double declenchement

  gameState.awaitingThemeFrom = null;
  if (gameState.themeChoiceTimer) {
    clearTimeout(gameState.themeChoiceTimer);
    gameState.themeChoiceTimer = null;
  }

  const info = categoryModel.getCategoryByCode(category);
  io.to(roomCode).emit('duel:theme-selected', {
    category,
    name: info?.name ?? category,
    icon: info?.icon ?? '❓',
    chooserPlayerId: chooser,
    autoPicked,
  });

  applyModeDecision(io, roomCode, gameState, { action: 'next-from-category', category });
}

/** Execute la decision prise par le mode de jeu apres une manche. */
function applyModeDecision(
  io: Server,
  roomCode: string,
  gameState: GameState,
  decision: ModeDecision
): void {
  const settings = roomSettings.get(roomCode);
  const categories = settings?.categories ?? [];
  const questionTypes = settings?.questionTypes ?? [];

  switch (decision.action) {
    case 'finish':
      finishGame(io, roomCode, gameState);
      return;

    case 'next-question':
      sendQuestion(io, roomCode, gameState);
      return;

    case 'load-more': {
      const more = questionModel.getMixedQuestions(decision.count, categories, questionTypes);
      if (more.length === 0) {
        finishGame(io, roomCode, gameState);
        return;
      }
      gameState.questions = gameState.questions.concat(more);
      sendQuestion(io, roomCode, gameState);
      return;
    }

    case 'next-from-category': {
      // Le mode impose le theme (escalade). On retombe sur les themes du salon
      // si la categorie demandee est epuisee, pour ne jamais bloquer la partie.
      const picked = questionModel.getMixedQuestions(1, [decision.category], questionTypes);
      const fallback = picked.length > 0
        ? picked
        : questionModel.getMixedQuestions(1, categories, questionTypes);
      if (fallback.length === 0) {
        finishGame(io, roomCode, gameState);
        return;
      }
      gameState.questions = gameState.questions.concat(fallback);
      sendQuestion(io, roomCode, gameState);
      return;
    }

    case 'await-theme-choice':
      requestThemeChoice(io, roomCode, gameState, decision.chooser);
      return;

    case 'next-inverted': {
      const inverted = buildInvertedQuestion(categories, questionTypes);
      if (!inverted) {
        // Pas assez de matiere pour fabriquer une manche a l'envers :
        // on enchaine normalement plutot que d'interrompre la partie.
        applyModeDecision(io, roomCode, gameState, { action: 'load-more', count: 5 });
        return;
      }
      gameState.questions = gameState.questions.concat(inverted);
      sendQuestion(io, roomCode, gameState);
      return;
    }
  }
}

const INVERTED_CHOICES = 4;

/**
 * Fabrique une manche "a l'envers" : on affiche une reponse possible et les
 * joueurs doivent retrouver de quelle question elle provient.
 *
 * La manche est produite comme une question de type H (QCM avec bonne reponse),
 * ce qui la rend jouable avec l'interface existante sans ecran dedie.
 * Les leurres sont d'autres intitules du catalogue, pour que le choix demande
 * une vraie lecture et pas une elimination par le style.
 */
function buildInvertedQuestion(categories: string[], questionTypes: string[]): Question[] | null {
  // On tire large puis on filtre : seules les questions a options portent une
  // reponse affichable telle quelle.
  const pool = questionModel
    .getMixedQuestions(40, categories, questionTypes)
    .filter(q => Array.isArray(q.options) && q.options.length >= 2);

  // Il faut la question source plus INVERTED_CHOICES-1 leurres, tous distincts.
  const distinct = new Map<string, Question>();
  for (const q of pool) distinct.set(q.text, q);
  const usable = [...distinct.values()];
  if (usable.length < INVERTED_CHOICES) return null;

  const shuffled = usable.sort(() => Math.random() - 0.5);
  const source = shuffled[0];
  const answer = source.options![Math.floor(Math.random() * source.options!.length)];

  const decoys = shuffled.slice(1, INVERTED_CHOICES).map(q => q.text);
  const options = [source.text, ...decoys].sort(() => Math.random() - 0.5);

  // La manche est persistee (inactive) : answers.question_id porte une cle
  // etrangere vers questions(id), un identifiant fabrique ferait echouer
  // l'enregistrement de chaque reponse.
  const created = questionModel.createSyntheticQuestion({
    type: 'H',
    category: source.category,
    text: `« ${answer} »\n\nDe quelle question cette réponse vient-elle ?`,
    options,
    correct_answer: source.text,
    timer: 30,
  });

  return [created];
}

function calculateBasePoints(
  type: QuestionType,
  answer1: string | undefined,
  answer2: string | undefined,
  correctAnswer?: string
): { basePoints: number; correct: boolean; points1?: number; points2?: number } {
  let basePoints = 0;
  let correct = false;

  // Type H: Individual scoring based on correct answer
  if (type === 'H') {
    const correct1 = answer1 === correctAnswer;
    const correct2 = answer2 === correctAnswer;
    return {
      basePoints: 0, // Not used for Type H
      correct: correct1 || correct2, // At least one got it right
      points1: correct1 ? BASE_POINTS : 0,
      points2: correct2 ? BASE_POINTS : 0
    };
  }

  if (!answer1 || !answer2) {
    return { basePoints, correct };
  }

  switch (type) {
    case 'A':
    case 'B':
    case 'E':
    case 'G':
    case 'I':  // Image choice - same as binary
    case 'L':  // Avant/Après - binary choice
    case 'N':  // Plus/Moins - binary choice
    case 'O':  // Scénario - match answer
    case 'P':  // Superpouvoir - match answer
    case 'R':  // Pet Peeves - match answer
    case 'S':  // Hot Take - agree/disagree match
      if (answer1 === answer2) {
        basePoints = BASE_POINTS;
        correct = true;
      }
      break;

    case 'F': {
      // "Qui de nous deux" : accord total, accord partiel, ou desaccord.
      // "Nous deux" face a une personne precise = les deux se rejoignent a moitie,
      // c'est un desaccord de nuance et non une erreur franche.
      if (answer1 === PLAYER_UNKNOWN || answer2 === PLAYER_UNKNOWN) {
        break;  // "Je ne sais pas" ne rapporte rien
      }
      if (answer1 === answer2) {
        basePoints = BASE_POINTS;
        correct = true;
      } else if (answer1 === PLAYER_BOTH || answer2 === PLAYER_BOTH) {
        basePoints = PARTIAL_AGREEMENT_POINTS;
        correct = true;
      }
      break;
    }

    case 'C':
      // Question ouverte : aucune bonne reponse, mais repondre sincerement tous les
      // deux merite mieux que zero. Sans ca, 17% des questions du jeu ne rapportaient
      // jamais le moindre point et cassaient la dynamique de score.
      basePoints = OPEN_ANSWER_POINTS;
      correct = true;
      break;

    case 'D':
    case 'Q': {
      // Echelle 1-10 : score degressif continu plutot qu'un palier brutal.
      // Avant, un ecart de 3 donnait 0 point exactement comme un ecart de 9.
      const val1 = parseInt(answer1, 10);
      const val2 = parseInt(answer2, 10);
      if (!isNaN(val1) && !isNaN(val2)) {
        const diff = Math.abs(val1 - val2);
        const points = SCALE_POINTS_BY_DIFF[diff];
        if (points !== undefined) {
          basePoints = points;
          correct = diff <= SCALE_CORRECT_MAX_DIFF;
        }
      }
      break;
    }

    case 'J':
      // Type J: Date exacte - compare month/year format (YYYY-MM)
      if (answer1 === answer2) {
        basePoints = BASE_POINTS;
        correct = true;
      } else {
        // Partial points if same year
        const [year1] = answer1.split('-');
        const [year2] = answer2.split('-');
        if (year1 === year2) {
          basePoints = 50;
          correct = true;
        }
      }
      break;

    case 'K':
      // Type K: Duration - proximity scoring (months ago)
      const months1 = parseInt(answer1, 10);
      const months2 = parseInt(answer2, 10);
      if (!isNaN(months1) && !isNaN(months2)) {
        const monthDiff = Math.abs(months1 - months2);
        if (monthDiff === 0) {
          basePoints = BASE_POINTS;
          correct = true;
        } else if (monthDiff <= 3) {
          basePoints = 75;
          correct = true;
        } else if (monthDiff <= 6) {
          basePoints = 50;
          correct = true;
        } else if (monthDiff <= 12) {
          basePoints = 25;
          correct = true;
        }
      }
      break;

    case 'M':
      // Type M: Top 3 ranking - partial points based on matches
      // Format: "item1,item2,item3"
      const ranking1 = answer1.split(',');
      const ranking2 = answer2.split(',');
      let matchCount = 0;
      for (let i = 0; i < Math.min(ranking1.length, ranking2.length); i++) {
        if (ranking1[i] === ranking2[i]) {
          matchCount++;
        }
      }
      if (matchCount === 3) {
        basePoints = BASE_POINTS;
        correct = true;
      } else if (matchCount === 2) {
        basePoints = 70;
        correct = true;
      } else if (matchCount === 1) {
        basePoints = 30;
        correct = true;
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
  // Une proposition de changement de mode restee en attente garderait un
  // minuteur actif apres la fin de la partie : on la solde ici.
  const pendingProposal = pendingModeProposals.get(roomCode);
  if (pendingProposal) {
    clearTimeout(pendingProposal.timer);
    pendingModeProposals.delete(roomCode);
  }
  // De meme pour le choix de theme du mode duel.
  if (gameState.themeChoiceTimer) {
    clearTimeout(gameState.themeChoiceTimer);
    gameState.themeChoiceTimer = null;
    gameState.awaitingThemeFrom = null;
  }

  // Clear all timers before finishing
  if (gameState.timer) {
    clearTimeout(gameState.timer);
    gameState.timer = null;
  }
  if (gameState.nextQuestionTimer) {
    clearTimeout(gameState.nextQuestionTimer);
    gameState.nextQuestionTimer = null;
  }
  for (const timer of gameState.disconnectGraceTimers.values()) {
    clearTimeout(timer);
  }
  gameState.disconnectGraceTimers.clear();

  // Mark game as finished
  gameModel.finishGame(gameState.gameId);
  roomModel.updateRoomStatus(gameState.roomId, 'finished');

  const { gamification } = gameState;

  // Determine winner - with tie-breakers
  let winner: 1 | 2 | 'tie';
  if (gameState.scores.player1 > gameState.scores.player2) {
    winner = 1;
  } else if (gameState.scores.player2 > gameState.scores.player1) {
    winner = 2;
  } else {
    // Tie-breaker 1: Max streak wins
    if (gamification.maxStreak1 > gamification.maxStreak2) {
      winner = 1;
    } else if (gamification.maxStreak2 > gamification.maxStreak1) {
      winner = 2;
    } else {
      // Tie-breaker 2: Total speed bonus wins
      if (gamification.speedBonusTotal1 > gamification.speedBonusTotal2) {
        winner = 1;
      } else if (gamification.speedBonusTotal2 > gamification.speedBonusTotal1) {
        winner = 2;
      } else {
        // Tie-breaker 3: Count total answers given (who participated more)
        let answersCount1 = 0;
        let answersCount2 = 0;
        gameState.answers.forEach(ans => {
          if (ans.answer1 !== undefined) answersCount1++;
          if (ans.answer2 !== undefined) answersCount2++;
        });
        if (answersCount1 > answersCount2) {
          winner = 1;
        } else if (answersCount2 > answersCount1) {
          winner = 2;
        } else {
          // Final tie-breaker: Random (extremely rare case)
          winner = Math.random() < 0.5 ? 1 : 2;
        }
      }
    }
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
    perfectMatches: gamification.perfectMatches,
    questionHistory: gameState.questionHistory
  };

  io.to(roomCode).emit('game:finished', finishedData);

  // Clean up game state
  activeGames.delete(roomCode);
}

export function getActiveGamesCount(): number {
  return activeGames.size;
}
