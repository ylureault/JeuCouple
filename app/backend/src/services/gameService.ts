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
  RoundState,
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
import {
  getGameMode,
  listGameModes,
  QUIZ_EXPRESS_QUESTION_COUNT,
  QUIZ_EXPRESS_REVEAL_SECONDS,
  QUIZ_EXPRESS_ANSWER_SECONDS,
} from './gameModes.js';
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
  // Numero de manche monotone, incremente a chaque question envoyee. Il sert
  // d'identifiant d'etat : un client qui recoit un roundState plus vieux que
  // celui qu'il affiche deja le jette, ce qui rend l'ordre d'arrivee des
  // paquets sans importance (B3 : les deux clients divergeaient).
  roundSeq: number;
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
  // --- Mode escalade ---
  // Dernier palier valide par les DEUX joueurs (0 = premier palier).
  escaladePalier: number;
  // Montee en attente : accords recus et minuteur (timeout = on reste).
  // Questions deja jouees dans CETTE partie : les tirages les excluent.
  servedIds: Set<number>;
  escaladeConsent: { nextCategory: string; stayCategory: string; palier: number; accepts: Set<1 | 2>; timer: ReturnType<typeof setTimeout> } | null;
}

interface PlayerConnection {
  socket: Socket;
  roomCode: string;
  playerId: 1 | 2;
}

/**
 * Rate-limiting (audit securite, style impose par le coach : limites
 * genereuses, drop silencieux, jamais de message punitif en pleine partie).
 * Fenetre glissante par cle ip|evenement.
 */
/**
 * Recap des reglages du salon, envoye aux DEUX joueurs (P0-5 du plan d'audit :
 * le joueur 2 decouvrait le theme — parfois tres explicite — a la premiere
 * question ; consentement asymetrique releve par le coach et l'UX).
 */
function buildRoomSettingsInfo(roomCode: string) {
  const settings = roomSettings.get(roomCode);
  if (!settings) return null;
  const mode = getGameMode(settings.gameMode);
  const allCats = categoryModel.getActiveCategories();
  const categories = settings.categories.length === 0
    ? []   // liste vide = tous les themes (mode auto)
    : settings.categories
        .map(code => allCats.find(c => c.code === code))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map(c => ({ code: c.code, name: c.name, icon: c.icon }));
  return {
    gameMode: mode.id,
    modeLabel: mode.label,
    modeIcon: mode.icon,
    endless: mode.endless,
    questionCount: settings.questionCount,
    categories,
    settingsAccepted: !!settings.settingsAccepted,
  };
}

function emitRoomSettings(io: Server, roomCode: string) {
  const info = buildRoomSettingsInfo(roomCode);
  if (info) io.to(roomCode).emit('room:settings', info);
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateAllow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now >= b.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}
// Purge periodique pour ne pas accumuler les cles mortes.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) if (now >= b.resetAt) rateBuckets.delete(k);
}, 60_000).unref();

const activeGames = new Map<string, GameState>();
const playerConnections = new Map<string, PlayerConnection>();
const roomSettings = new Map<string, { questionCount: number; categories: string[]; questionTypes: string[]; gameMode: string; settingsAccepted?: boolean }>();

/**
 * Sockets VIVANTS d'un joueur dans un salon.
 *
 * Un joueur peut en avoir plusieurs : deux onglets sur le meme ordinateur
 * (cas reel d'un couple qui joue a deux sur une seule machine), ou un ancien
 * socket pas encore expire pendant une reconnexion. L'ancienne version gardait
 * une seule entree par joueur et EJECTAIT la precedente du salon socket.io :
 * l'onglet evince restait "connecte" pour le navigateur mais ne recevait plus
 * rien et ses clics partaient dans le vide (B5), tout en continuant d'afficher
 * une manche figee (B3). Pire : sa deconnexion reelle n'etait plus reconnue,
 * donc la partie ne se mettait jamais en pause (B4).
 */
function playerSockets(roomCode: string, playerId: 1 | 2): Socket[] {
  const live: Socket[] = [];
  for (const conn of playerConnections.values()) {
    if (conn.roomCode === roomCode && conn.playerId === playerId && conn.socket.connected) {
      live.push(conn.socket);
    }
  }
  return live;
}

function isPlayerConnected(roomCode: string, playerId: 1 | 2): boolean {
  return playerSockets(roomCode, playerId).length > 0;
}

/**
 * Etat COMPLET de la manche : le serveur est seule source de verite, les
 * clients ne font qu'afficher. Tout y est (manche, question, LES DEUX scores,
 * pause) et le temps restant se deduit de `deadline`, un instant absolu dans
 * l'horloge du serveur. Un decompte local qui s'auto-decremente derive des que
 * l'onglet passe en arriere-plan ; une soustraction depuis une echeance
 * absolue, non.
 */
function buildRoundState(roomCode: string, gameState: GameState): RoundState {
  const question = gameState.currentQuestion;
  // Pas d'echeance hors phase de question ni en pause : le client fige alors
  // son affichage au lieu de continuer a decompter dans le vide.
  const deadline =
    gameState.phase === 'question' && !gameState.paused && question
      ? gameState.questionStartTime + question.timer * 1000
      : null;

  return {
    roundId: gameState.roundSeq,
    roundNumber: gameState.currentQuestionIndex + 1,
    totalQuestions: gameState.questions.length,
    question,
    scores: { player1: gameState.scores.player1, player2: gameState.scores.player2 },
    phase: gameState.phase === 'reveal' ? 'reveal' : 'question',
    deadline,
    serverNow: Date.now(),
    paused: gameState.paused,
    pausedReason: gameState.disconnectedPlayerName,
    gameMode: roomSettings.get(roomCode)?.gameMode ?? 'classic',
  };
}

/** Diffuse l'etat de manche aux DEUX joueurs. A appeler a CHAQUE changement. */
function emitRoundState(io: Server, roomCode: string, gameState: GameState): void {
  io.to(roomCode).emit('game:round-state', buildRoundState(roomCode, gameState));
}

/**
 * Certains modes imposent leur perimetre de questions et ne laissent donc pas
 * le choix des themes/types a l'hote : le mix ouvre a TOUT (afficher "Mix" sur
 * un sous-ensemble n'aurait pas de sens), le quiz express se limite a la
 * culture generale en QCM (type H) puisque c'est sa definition meme.
 * La regle est centralisee ici parce qu'elle s'applique a DEUX moments — la
 * creation du salon et le changement de mode en cours de partie — et que ces
 * deux chemins avaient deja diverge par le passe.
 */
function enforceModeScope(
  gameMode: string,
  categories: string[],
  questionTypes: string[]
): { categories: string[]; questionTypes: string[]; restricted: boolean } {
  // Le mix elargit : il n'y a rien a re-tirer, les questions deja chargees
  // restent valables. Il n'est donc pas marque "restricted".
  if (gameMode === 'mix') return { categories: [], questionTypes, restricted: false };
  if (gameMode === 'quiz_express') {
    return { categories: ['culture'], questionTypes: ['H'], restricted: true };
  }
  return { categories, questionTypes, restricted: false };
}

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
// Ne pas repondre ne coute RIEN. La penalite de -50 transformait chaque
// manche non jouee (question injouable, hesitation, deconnexion) en sanction,
// et les scores plongeaient a -600. Le joker, lui, reste volontaire et payant.
const NO_ANSWER_PENALTY = 0;
const UNLIMITED_MODE_QUESTION_COUNT = 50;  // When set to 50, it's unlimited
const UNLIMITED_MODE_GAP_TO_WIN = 200;  // 200 point gap to win in unlimited

/**
 * P1-8 (ARCHI-2 amende par le coach) : l'etat de jeu vit en memoire. Apres un
 * redemarrage, les rooms restees 'playing' sont des zombies — les joueurs s'y
 * reconnectaient dans un salon sans question ni fin possible. On les clot au
 * demarrage, et on retient leurs codes pour servir un message honnete
 * ("partie interrompue") plutot qu'un "Game already finished" mensonger.
 * Aucun faux podium possible : l'ecran de resultats ne s'affiche que sur
 * l'evenement game:finished, jamais depuis la base.
 */
const interruptedRooms = new Set<string>();
let interruptedSweepDone = false;
function sweepInterruptedRooms() {
  if (interruptedSweepDone) return;
  interruptedSweepDone = true;
  for (const room of roomModel.getAllRooms()) {
    if (room.status === 'playing') {
      interruptedRooms.add(room.code);
      roomModel.updateRoomStatus(room.id, 'finished');
    }
  }
  if (interruptedRooms.size > 0) {
    console.log(`${interruptedRooms.size} partie(s) interrompue(s) par le redemarrage, cloturee(s)`);
  }
}

export function setupSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  sweepInterruptedRooms();

  // TL-7 : roomSettings (et l'acceptation qu'il porte) n'etait jamais purge.
  // On retire les entrees dont la room n'existe plus ou est terminee.
  setInterval(() => {
    for (const code of roomSettings.keys()) {
      const room = roomModel.getRoomByCode(code);
      if (!room || room.status === 'finished') {
        roomSettings.delete(code);
        pendingModeProposals.get(code) && clearTimeout(pendingModeProposals.get(code)!.timer);
        pendingModeProposals.delete(code);
      }
    }
  }, 10 * 60_000).unref();

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

        // Valide contre le registre, pas contre une liste en dur : l'ancienne
        // version (=== 'duel' ? 'duel' : 'classic') degradait silencieusement
        // 6 des 8 modes en "classic" — constat de l'audit d'architecture.
        const gameMode = listGameModes().some(m => m.id === data.gameMode)
          ? (data.gameMode as string)
          : 'classic';
        // Store room settings (question count, categories, and question types)
        // Le quiz express est cale sur une partie courte : c'est sa longueur de
        // reference, pas celle du jeu de couple. Un choix explicite de l'hote
        // reste prioritaire.
        const defaultCount = gameMode === 'quiz_express'
          ? QUIZ_EXPRESS_QUESTION_COUNT
          : DEFAULT_QUESTION_COUNT;
        const questionCount = data.questionCount && data.questionCount >= 5 && data.questionCount <= 50
          ? data.questionCount
          : defaultCount;
        // If no categories specified or empty array, use all categories (auto mode)
        const categories = data.categories && data.categories.length > 0 ? data.categories : [];
        // If no question types specified or empty array, use all types (auto mode)
        const questionTypes = data.questionTypes && data.questionTypes.length > 0 ? data.questionTypes : [];
        // Les modes a perimetre impose (mix, quiz express) reecrivent ces reglages.
        const scope = enforceModeScope(gameMode, categories, questionTypes);
        roomSettings.set(room.code, {
          questionCount,
          categories: scope.categories,
          questionTypes: scope.questionTypes,
          gameMode,
        });

        // Jeton secret : seule preuve d'appartenance acceptee au reconnect.
        const sessionToken = roomModel.issueSessionToken(room.id, 1);
        callback({ success: true, room, playerId: 1, sessionToken });
        const info = buildRoomSettingsInfo(room.code);
        if (info) socket.emit('room:settings', info);
      } catch (error) {
        callback({ success: false, error: 'Failed to create room' });
      }
    });

    // Join room
    socket.on('room:join', (data, callback) => {
      try {
        // Frein a l'enumeration des codes de salon (audit securite) :
        // 15 tentatives/minute par IP suffisent tres largement a un humain.
        const ip = socket.handshake.address || 'unknown';
        if (!rateAllow(`${ip}|join`, 15, 60_000)) {
          callback({ success: false, error: 'Trop de tentatives, reessaie dans une minute' });
          return;
        }
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

        const sessionToken = roomModel.issueSessionToken(room.id, 2);
        callback({ success: true, room, playerId: 2, sessionToken });
        emitRoomSettings(io, room.code);
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

        const ip = socket.handshake.address || 'unknown';
        if (!rateAllow(`${ip}|reconnect`, 20, 60_000)) {
          callback({ success: false, error: 'Trop de tentatives, reessaie dans une minute' });
          return;
        }

        const room = roomModel.getRoomByCode(data.code);

        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }

        // Check if room is finished - don't allow reconnection to finished rooms
        if (room.status === 'finished') {
          callback({
            success: false,
            error: interruptedRooms.has(room.code)
              ? 'Cette partie a été interrompue par un redémarrage du serveur — désolé ! Créez-en une nouvelle.'
              : 'Game already finished'
          });
          return;
        }

        // Le jeton remis au join est la seule preuve d'appartenance : sans
        // lui, connaitre un code suffisait a voler la place d'un joueur.
        if (!roomModel.verifySessionToken(room.id, data.playerId, data.sessionToken)) {
          callback({ success: false, error: 'Session invalide pour ce salon' });
          return;
        }


        // Validate that the player slot exists in the room
        const playerName = data.playerId === 1 ? room.player1_name : room.player2_name;
        if (!playerName) {
          callback({ success: false, error: 'Player slot not found in room' });
          return;
        }

        socket.join(room.code);

        // On ne purge QUE les entrees dont le socket est reellement mort.
        // Avant, toute connexion precedente du meme joueur etait sortie du
        // salon socket.io (oldSocket.leave) et retiree de la table : l'onglet
        // evince gardait un socket ouvert mais ne recevait plus aucun
        // evenement et tous ses envois etaient ignores — le "2e onglet qui
        // meurt" et les boutons muets de la recette. Deux onglets du meme
        // appareil coexistent desormais sans s'entretuer.
        for (const [oldSocketId, conn] of playerConnections.entries()) {
          if (oldSocketId === socket.id) continue;
          if (conn.roomCode !== room.code || conn.playerId !== data.playerId) continue;
          if (!conn.socket.connected) {
            console.log('Purge d\'une connexion morte du joueur', data.playerId, ':', oldSocketId);
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
        const settingsInfo = buildRoomSettingsInfo(room.code);
        if (settingsInfo) socket.emit('room:settings', settingsInfo);

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
            // Meme regle a la reconnexion : la bonne reponse reste au serveur.
            const { correct_answer: _s, ...questionPublique } = gameState.currentQuestion;
            socket.emit('game:question', {
              question: questionPublique as typeof gameState.currentQuestion,
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

          // Resume if game was paused due to disconnect (not manual pause).
          // On exige que les DEUX joueurs soient de nouveau la : si l'on
          // reprenait des le retour du premier, la partie recommencerait a
          // tourner a vide pour l'autre — exactement le bug B4.
          const bothBack = isPlayerConnected(room.code, 1) && isPlayerConnected(room.code, 2);
          if (gameState.paused && !gameState.manualPause && bothBack) {
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
          } else if (gameState.paused) {
            // Partie toujours en pause (pause volontaire, ou partenaire encore
            // absent) : on le dit au joueur qui revient plutot que de le
            // laisser devant un ecran de jeu inerte.
            console.log('Player', playerName, 'reconnected but game is still paused');
            socket.emit('game:paused', {
              disconnectedPlayer: data.playerId,
              playerName: (gameState.disconnectedPlayerName || 'Pause')
            });
          }

          // Ré-émission de l'etat complet a la reconnexion (B3) : le joueur qui
          // revient repart EXACTEMENT du meme etat que son partenaire, y compris
          // l'echeance absolue du minuteur. On diffuse aux deux pour qu'un
          // resume eventuel soit vu des deux cotes dans le meme paquet.
          emitRoundState(io, room.code, gameState);
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
    // P0-5 : le joueur qui a rejoint valide les reglages choisis par l'hote.
    socket.on('room:accept-settings', () => {
      const connection = playerConnections.get(socket.id);
      if (!connection || connection.playerId !== 2) return;
      const settings = roomSettings.get(connection.roomCode);
      if (!settings) return;
      settings.settingsAccepted = true;
      io.to(connection.roomCode).emit('room:settings-accepted', { playerId: 2 });
    });

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

      // P0-5 : pas de lancement tant que le joueur 2 n'a pas accepte les
      // reglages (mode, themes) choisis par l'hote — consentement explicite.
      const startSettings = roomSettings.get(connection.roomCode);
      if (startSettings && !startSettings.settingsAccepted) {
        callback({ success: false, error: `${room.player2_name} n'a pas encore accepte les reglages` });
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
        roundSeq: 0,
        currentQuestionIndex: 0,
        currentQuestion: null,
        answers: new Map(),
        scores: { player1: 0, player2: 0 },
        timer: null,
        phase: 'waiting',
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
        escaladePalier: 0,
        servedIds: new Set<number>(),
        escaladeConsent: null,
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

      // Premiere question apres un court delai de montage des clients.
      setTimeout(() => {
        sendQuestion(io, room.code, gameState);
      }, 800);
    });

    // Answer question
    socket.on('game:answer', (data, callback) => {
      // Ack explicite (arbitrage TL-3 + Secu 7 + coach) : une reponse refusee
      // est DITE au joueur — on ne tronque jamais une confession en silence.
      const ack = (accepted: boolean, error?: string) => {
        if (typeof callback === 'function') callback({ accepted, error });
      };

      const connection = playerConnections.get(socket.id);
      if (!connection) { ack(false, 'Connexion au salon perdue'); return; }

      if (typeof data?.answer !== 'string' || data.answer.length === 0) {
        ack(false, 'Reponse vide ou invalide');
        return;
      }
      if (data.answer.length > 500) {
        ack(false, 'Reponse trop longue (500 caracteres maximum)');
        return;
      }

      const gameState = activeGames.get(connection.roomCode);
      if (!gameState) { ack(false, 'Aucune partie en cours'); return; }

      console.log(`[ANSWER] Player ${connection.playerId} answering - Room: ${connection.roomCode}, Phase: ${gameState.phase}, Question: ${gameState.currentQuestionIndex + 1}`);

      // Only accept answers in question phase
      if (gameState.phase !== 'question') {
        console.log(`[ANSWER] REJECTED - Phase is ${gameState.phase}, not question`);
        ack(false, 'La question est deja terminee');
        return;
      }

      // Don't accept answers if game is paused
      if (gameState.paused) {
        console.log('[ANSWER] REJECTED - Game paused');
        ack(false, 'La partie est en pause');
        return;
      }

      const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
      const answerTime = Date.now();

      // Save answer with timestamp
      const questionAnswers = gameState.answers.get(currentQuestion.id) || {};

      // Prevent duplicate answers from same player
      if (connection.playerId === 1 && questionAnswers.answer1 !== undefined) {
        console.log('[ANSWER] REJECTED - Duplicate from player 1');
        ack(false, 'Reponse deja enregistree');
        return;
      }
      if (connection.playerId === 2 && questionAnswers.answer2 !== undefined) {
        console.log('[ANSWER] REJECTED - Duplicate from player 2');
        ack(false, 'Reponse deja enregistree');
        return;
      }
      console.log(`[ANSWER] ACCEPTED - Player ${connection.playerId}`);
      ack(true);

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
      // Bascule en cours de partie : le nouveau mode peut imposer son perimetre
      // (mix = tous les themes, quiz express = culture generale en QCM). Meme
      // regle qu'a la creation du salon, pour que les deux chemins ne divergent pas.
      const scope = enforceModeScope(pending.mode, settings.categories, settings.questionTypes);
      settings.categories = scope.categories;
      settings.questionTypes = scope.questionTypes;
      roomSettings.set(roomCode, settings);

      // Un mode qui RETRECIT le perimetre (quiz express) ne peut pas se contenter
      // de changer les reglages : la file deja chargee par le mode precedent
      // contient des questions hors sujet, et le moteur les servirait telles
      // quelles. Le joueur a accepte "culture generale en QCM", pas la fin du
      // stock du mode d'avant. On remplace donc la portion NON ENCORE JOUEE par
      // un tirage dans le nouveau perimetre, a longueur identique pour ne pas
      // raccourcir ni rallonger la partie annoncee.
      const runningGame = activeGames.get(roomCode);
      if (scope.restricted && runningGame) {
        const played = runningGame.currentQuestionIndex + 1;   // la question en cours reste valable
        const remaining = runningGame.questions.length - played;
        if (remaining > 0) {
          const fresh = drawFresh(runningGame, remaining, scope.categories, scope.questionTypes);
          if (fresh.length > 0) {
            runningGame.questions = [...runningGame.questions.slice(0, played), ...fresh];
          }
        }
      }

      const def = listGameModes().find(m => m.id === pending.mode)!;
      io.to(roomCode).emit('mode:changed', {
        mode: def.id as never,
        label: def.label,
        icon: def.icon,
      });
      // Le nouveau mode s'applique des la manche suivante : la question en
      // cours reste valable, on n'interrompt pas les joueurs en plein tour.
    });

    // Escalade : chaque joueur repond a la proposition de montee de palier.
    socket.on('escalade:palier-respond', (data: { accept: boolean }) => {
      const connection = playerConnections.get(socket.id);
      if (!connection) return;
      const gameState = activeGames.get(connection.roomCode);
      const consent = gameState?.escaladeConsent;
      if (!gameState || !consent) return;
      if (!data?.accept) {
        // Un seul refus suffit, et il reste anonyme dans le resultat.
        resolvePalierConsent(io, connection.roomCode, gameState, false);
        return;
      }
      consent.accepts.add(connection.playerId);
      if (consent.accepts.has(1) && consent.accepts.has(2)) {
        resolvePalierConsent(io, connection.roomCode, gameState, true);
      }
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
        // B4 : on ne peut pas "reprendre" une pause causee par une absence.
        // Sans ce garde, un joueur reste seul devant l'ecran de pause, appuie
        // sur reprendre, et la partie repart a vide comme avant le correctif.
        if (!gameState.manualPause
            && !(isPlayerConnected(connection.roomCode, 1) && isPlayerConnected(connection.roomCode, 2))) {
          callback?.({ success: false, paused: true });
          return;
        }
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
        // Nouvelle echeance absolue apres la pause : sans cette rediffusion,
        // les clients repartiraient d'une deadline perimee.
        emitRoundState(io, connection.roomCode, gameState);
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

        gameState.disconnectedPlayerName = playerName + ' a mis en pause';
        io.to(connection.roomCode).emit('game:paused', {
          disconnectedPlayer: connection.playerId,
          playerName: playerName + ' a mis en pause'
        });
        emitRoundState(io, connection.roomCode, gameState);
        callback?.({ success: true, paused: true });
      }
    });

    socket.on('game:reaction', (data) => {
      if (!rateAllow(`${socket.id}|reaction`, 30, 10_000)) return;  // drop silencieux (audit securite)
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
      if (!rateAllow(`${socket.id}|textreact`, 20, 10_000)) return;  // drop silencieux (audit securite)
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
      if (!rateAllow(`${socket.id}|soundreact`, 15, 10_000)) return;  // drop silencieux (audit securite)
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
      if (!rateAllow(`${socket.id}|quickmsg`, 20, 10_000)) return;  // drop silencieux (audit securite)
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
      if (!rateAllow(`${socket.id}|buzz`, 10, 10_000)) return;  // drop silencieux (audit securite)
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
      if (!rateAllow(`${socket.id}|kiss`, 20, 10_000)) return;  // drop silencieux (audit securite)
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
      if (!rateAllow(`${socket.id}|chat`, 20, 10_000)) return;  // drop silencieux (audit securite)
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
      if (!rateAllow(`${socket.id}|ptt`, 40, 10_000)) return;  // drop silencieux (audit securite)
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

/**
 * B4 : met la partie en pause parce qu'un joueur n'est plus la.
 *
 * Un seul endroit fige les minuteurs, retient le temps restant et previent le
 * partenaire — la logique existait en double (deconnexion / pause manuelle) et
 * un des deux chemins oubliait de couper le minuteur de la question suivante,
 * d'ou une partie qui continuait a enchainer les manches dans le vide.
 */
function pauseGameForDisconnect(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomCode: string,
  gameState: GameState,
  playerId: 1 | 2,
  playerName: string
): void {
  if (gameState.paused) return;

  gameState.paused = true;
  gameState.pausedAt = Date.now();
  gameState.disconnectedPlayerName = playerName;
  gameState.connectedPlayers.delete(playerId);

  // TOUS les minuteurs sautent : celui de la question ET celui qui enchaine la
  // manche suivante. C'est ce dernier, laisse actif, qui faisait defiler les
  // manches 6 -> 11 devant un partenaire seul.
  if (gameState.timer) {
    clearTimeout(gameState.timer);
    gameState.timer = null;
  }
  if (gameState.nextQuestionTimer) {
    clearTimeout(gameState.nextQuestionTimer);
    gameState.nextQuestionTimer = null;
  }

  // Temps restant fige : la reprise repartira de la, pas de zero.
  if (gameState.phase === 'question' && gameState.currentQuestion) {
    const elapsed = (Date.now() - gameState.questionStartTime) / 1000;
    gameState.remainingTime = Math.max(0, gameState.currentQuestion.timer - elapsed);
  }

  console.log('Partie en pause dans le salon', roomCode, '- en attente de', playerName);

  io.to(roomCode).emit('game:paused', {
    disconnectedPlayer: playerId,
    playerName
  });
  // L'etat complet suit la pause : le partenaire voit un ecran coherent
  // (meme manche, memes scores, minuteur fige) et non un jeu qui avance seul.
  emitRoundState(io, roomCode, gameState);
}

function handleDisconnect(
  socket: Socket,
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  const connection = playerConnections.get(socket.id);
  if (!connection) return;

  console.log('Player disconnected:', socket.id, 'from room:', connection.roomCode);

  // On retire l'entree AVANT tout diagnostic : playerSockets() doit refleter
  // la realite pour repondre a la seule question qui compte — reste-t-il un
  // socket vivant a ce joueur (autre onglet du meme appareil) ?
  playerConnections.delete(socket.id);
  socket.leave(connection.roomCode);

  const stillHere = isPlayerConnected(connection.roomCode, connection.playerId);
  const gameState = activeGames.get(connection.roomCode);

  // Only notify room:player-left when NOT in an active game
  // During a game, the pause/resume system handles disconnect display
  if (!gameState && !stillHere) {
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

  // Un autre onglet du meme joueur tient encore la connexion : rien a signaler.
  if (stillHere) {
    console.log('Joueur', connection.playerId, 'toujours present via un autre onglet, aucune pause');
    return;
  }

  if (gameState && !gameState.paused) {
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

    // Delai de grace : une micro-coupure reseau ne doit pas interrompre la
    // partie. Passe ce delai, la pause est ferme.
    const graceTimer = setTimeout(() => {
      const currentGameState = activeGames.get(connection.roomCode);
      if (!currentGameState) return;
      currentGameState.disconnectGraceTimers.delete(connection.playerId);
      // Revenu entre-temps (n'importe quel onglet) : on ne coupe rien.
      if (isPlayerConnected(connection.roomCode, connection.playerId)) return;
      pauseGameForDisconnect(io, connection.roomCode, currentGameState, connection.playerId, playerName);
    }, DISCONNECT_GRACE_PERIOD);
    gameState.disconnectGraceTimers.set(connection.playerId, graceTimer);
  }
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

  // B4 — filet de securite : on ne SERT JAMAIS une manche a un joueur absent.
  // Le delai de grace et l'evenement 'disconnect' peuvent tous deux etre
  // manques (socket zombie, evenement perdu au redemarrage) ; ce controle, lui,
  // est fait juste avant d'engager la manche, donc il ne peut pas etre contourne.
  for (const pid of [1, 2] as const) {
    if (isPlayerConnected(roomCode, pid)) continue;
    const room = roomModel.getRoomByCode(roomCode);
    const absentName = (pid === 1 ? room?.player1_name : room?.player2_name) || 'Ton partenaire';
    console.log('[SEND_QUESTION] Joueur', pid, 'absent : pause au lieu d\'enchainer');
    pauseGameForDisconnect(io, roomCode, gameState, pid, absentName);
    return;
  }

  // Clear any existing question timer to prevent duplicates
  if (gameState.timer) {
    console.log('[SEND_QUESTION] Clearing existing timer');
    clearTimeout(gameState.timer);
    gameState.timer = null;
  }

  const source = gameState.questions[gameState.currentQuestionIndex];
  // Quiz express : on plafonne le temps de reponse (les QCM de culture G sont
  // ecrits avec 20 s, trop long pour un mode qui vend la vitesse). On ecrit sur
  // la question STOCKEE et pas seulement sur la copie envoyee, parce que le
  // bonus de rapidite est recalcule plus tard depuis gameState.questions : sans
  // ca, le joueur aurait 12 s a l'ecran mais serait note sur 20 s.
  if (roomSettings.get(roomCode)?.gameMode === 'quiz_express'
      && source.timer > QUIZ_EXPRESS_ANSWER_SECONDS) {
    source.timer = QUIZ_EXPRESS_ANSWER_SECONDS;
  }

  const question = { ...source };
  gameState.servedIds.add(question.id);
  gameState.phase = 'question';
  gameState.questionStartTime = Date.now();
  gameState.roundSeq++;   // nouvelle manche : nouvel identifiant d'etat
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

  // La bonne reponse ne quitte JAMAIS le serveur avant la revelation :
  // elle partait dans game:question, donc visible dans la trame socket avant
  // meme de repondre (quiz et mode "A l'envers" trichables).
  const { correct_answer: _secret, ...questionPublique } = question;
  io.to(roomCode).emit('game:question', {
    question: questionPublique as typeof question,
    questionNumber: gameState.currentQuestionIndex + 1,
    totalQuestions: gameState.questions.length
  });
  // L'etat complet part dans la foulee, aux DEUX joueurs, avec l'echeance
  // absolue. C'est lui qui fait foi : question, manche, scores et minuteur
  // proviennent tous du meme paquet, ils ne peuvent donc plus diverger.
  emitRoundState(io, roomCode, gameState);

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
export function calculateSpeedBonus(
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

export function getStreakMultiplier(streak: number): number {
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
  // 'passer' (P1-6, constat n.1 du coach) : refuser une question trop intime
  // ne coute RIEN — ni points, ni penalite, ni serie brisee. Le joker payant
  // reste pour esquiver en mode compete ; passer est la pose de limite gratuite.
  const isPass1 = answers.answer1 === 'passer';
  const isPass2 = answers.answer2 === 'passer';
  const isDontKnow1 = answers.answer1 === 'dontknow';
  const isDontKnow2 = answers.answer2 === 'dontknow';
  const noAnswer1 = answers.answer1 === undefined;
  const noAnswer2 = answers.answer2 === undefined;

  // For scoring purposes, joker and dontknow are treated as no valid answer
  const effectiveAnswer1 = (isJoker1 || isDontKnow1 || isPass1) ? undefined : answers.answer1;
  const effectiveAnswer2 = (isJoker2 || isDontKnow2 || isPass2) ? undefined : answers.answer2;

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
    // Passer ne brise pas la serie : ce serait punir la pose d'une limite.
    if (!isPass1) gamification.streak1 = 0;
    if (!isPass2) gamification.streak2 = 0;
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
  // Les sorties volontaires (passer/joker/je-ne-sais-pas) ne concourent pas
  // au bonus de vitesse : on ne recompense pas "celui qui a esquive le plus vite".
  const realAnswer1 = !isPass1 && !isJoker1 && !isDontKnow1 && !noAnswer1;
  const realAnswer2 = !isPass2 && !isJoker2 && !isDontKnow2 && !noAnswer2;
  if (points1 === points2 && points1 >= 0 && answerTime1 !== null && answerTime2 !== null && realAnswer1 && realAnswer2) {
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

  // Update scores. Plancher a 0 : le score peut stagner, jamais devenir une
  // humiliation. Le joker garde son cout, mais ne creuse pas indefiniment.
  gameState.scores.player1 = Math.max(0, gameState.scores.player1 + points1);
  gameState.scores.player2 = Math.max(0, gameState.scores.player2 + points2);

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

  revealData.nextInSeconds = revealSeconds(question.type, roomSettings.get(roomCode)?.gameMode);
  io.to(roomCode).emit('game:reveal', revealData);

  // Send score update
  io.to(roomCode).emit('game:score-update', {
    score1: gameState.scores.player1,
    score2: gameState.scores.player2
  });
  // Les scores viennent de changer : on rediffuse l'etat complet. Les deux
  // joueurs affichent donc TOUJOURS le meme couple de scores — la recette en
  // relevait quatre valeurs differentes pour deux joueurs.
  emitRoundState(io, roomCode, gameState);

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
      acquiredPalier: gameState.escaladePalier,
      settings: {
        questionCount: settings?.questionCount ?? DEFAULT_QUESTION_COUNT,
        categories: settings?.categories ?? [],
        questionTypes: settings?.questionTypes ?? [],
      },
    });

    applyModeDecision(io, roomCode, gameState, decision);
  }, revealSeconds(
    gameState.questions[gameState.currentQuestionIndex]?.type ?? 'A',
    roomSettings.get(roomCode)?.gameMode
  ) * 1000);
}

const PALIER_CONSENT_TIMEOUT_SECONDS = 25;

/**
 * Escalade (P1-11, constat GRAVE n.4 du coach) : la montee vers un palier plus
 * explicite exige l'accord des DEUX joueurs. Meme patron que le choix de theme
 * du duel — feuille + minuteur — pas de 4e protocole ad hoc. Un refus ou un
 * silence n'arrete rien : on reste au palier acquis, sans commentaire.
 */
function requestPalierConsent(
  io: Server,
  roomCode: string,
  gameState: GameState,
  d: { nextCategory: string; stayCategory: string; palier: number }
): void {
  const info = categoryModel.getCategoryByCode(d.nextCategory);
  const timer = setTimeout(() => {
    resolvePalierConsent(io, roomCode, gameState, false);
  }, PALIER_CONSENT_TIMEOUT_SECONDS * 1000);

  gameState.escaladeConsent = { ...d, accepts: new Set(), timer };

  io.to(roomCode).emit('escalade:palier', {
    palier: d.palier,
    category: { code: d.nextCategory, name: info?.name ?? d.nextCategory, icon: info?.icon ?? '🌡️' },
    timeoutSeconds: PALIER_CONSENT_TIMEOUT_SECONDS,
  });
}

function resolvePalierConsent(
  io: Server,
  roomCode: string,
  gameState: GameState,
  accepted: boolean
): void {
  const consent = gameState.escaladeConsent;
  if (!consent) return;   // deja tranche
  clearTimeout(consent.timer);
  gameState.escaladeConsent = null;

  if (accepted) gameState.escaladePalier = consent.palier;
  io.to(roomCode).emit('escalade:palier-result', { accepted });

  applyModeDecision(io, roomCode, gameState, {
    action: 'next-from-category',
    category: accepted ? consent.nextCategory : consent.stayCategory,
  });
}

// Cadence (demande utilisateur : "faut que ca cadence bien").
// 10 s figees apres CHAQUE revelation trainaient sur les questions binaires
// et manquaient sur les reponses libres a comparer.
const REVEAL_SECONDS_DEFAULT = 7;   // binaires, QCM, echelles : vite lu
const REVEAL_SECONDS_TEXT = 14;     // type C : deux textes a lire et commenter
/**
 * La cadence n'est pas qu'une affaire de type de question : elle fait partie de
 * l'identite de certains modes. Le quiz express perdrait son nerf avec 7 s de
 * pause apres chaque QCM, la bonne reponse se lisant d'un coup d'oeil.
 * Parametre optionnel : les 9 modes historiques gardent exactement leur rythme.
 */
export function revealSeconds(type: QuestionType, gameMode?: string): number {
  if (gameMode === 'quiz_express') return QUIZ_EXPRESS_REVEAL_SECONDS;
  return type === 'C' ? REVEAL_SECONDS_TEXT : REVEAL_SECONDS_DEFAULT;
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

/**
 * Tirage excluant les questions deja servies dans la partie. Si le vivier est
 * epuise (petite categorie en mode sans fin), on recommence un cycle complet
 * plutot que de couper la partie.
 */
function drawFresh(
  gameState: GameState,
  count: number,
  categories: string[],
  questionTypes: string[]
): Question[] {
  const fresh = questionModel.getMixedQuestions(count, categories, questionTypes, [...gameState.servedIds]);
  if (fresh.length > 0) return fresh;
  return questionModel.getMixedQuestions(count, categories, questionTypes);
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
      const more = drawFresh(gameState, decision.count, categories, questionTypes);
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
      const picked = drawFresh(gameState, 1, [decision.category], questionTypes);
      const fallback = picked.length > 0
        ? picked
        : drawFresh(gameState, 1, categories, questionTypes);
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

    case 'await-palier-consent':
      requestPalierConsent(io, roomCode, gameState, decision);
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

export function calculateBasePoints(
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
  // De meme pour une montee de palier en attente.
  if (gameState.escaladeConsent) {
    clearTimeout(gameState.escaladeConsent.timer);
    gameState.escaladeConsent = null;
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

  // P0 du plan d'audit (coach + securite) : les reponses libres contiennent
  // des confessions intimes. Une fois les resultats envoyes (l'historique de
  // la partie vit dans finishedData, deja emis), rien ne justifie de garder
  // ces textes en clair dans SQLite : on purge les reponses de la partie.
  try {
    gameModel.deleteAnswersForGame(gameState.gameId);
  } catch (e) {
    console.error('Purge des reponses impossible pour la partie', gameState.gameId, e);
  }

  // Clean up game state
  activeGames.delete(roomCode);
}

export function getActiveGamesCount(): number {
  return activeGames.size;
}
