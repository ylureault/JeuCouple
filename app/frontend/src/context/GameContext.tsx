import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode
} from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  Room,
  Question,
  ServerToClientEvents,
  ClientToServerEvents,
  GameRevealData,
  GameFinishedData,
  Gender,
  ReactionEmoji,
  ReactionData,
  TextReactionData,
  TextReactionId,
  SoundReactionData,
  SoundReactionId,
  ChatMessage,
  QuickMessageId,
  QuickMessageData,
  BuzzData,
  KissData,
  GameMode,
  ThemeChoiceRequest,
  ThemeChoiceWaiting,
  ModeProposal,
  RoomSettingsInfo,
  RoundState
} from '../../../shared/types';

/**
 * Etapes de la reprise de session, dans l'ordre ou elles se succedent.
 * Elles existent parce que le bug de prod etait un probleme d'ORDONNANCEMENT :
 * plusieurs gardes se declenchaient avant meme que le socket soit connecte et
 * effacaient une session parfaitement valide. Un etat unique et explicite rend
 * cet ordre impossible a violer.
 */
export type ResumePhase =
  | 'booting'     // le provider vient de monter, le socket n'existe pas encore
  | 'connecting'  // socket cree, on attend l'evenement 'connect'
  | 'restoring'   // connecte, room:reconnect en cours (avec retentatives)
  | 'live'        // rien a restaurer, ou reprise reussie
  | 'failed';     // echec avere : on affiche le motif, jamais un ecran vide

interface GameState {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connected: boolean;
  // B5 : le socket a saute et socket.io retente. Sert a afficher le bandeau
  // "Connexion perdue" et a desactiver les boutons plutot que de les laisser
  // cliquables et morts.
  reconnecting: boolean;
  reconnectAttempts: number;
  // Etape courante de la reprise + motif lisible en cas d'echec.
  resumePhase: ResumePhase;
  resumeError: string | null;
  room: Room | null;
  playerId: 1 | 2 | null;
  playerName: string;
  gameId: number | null;
  currentQuestion: Question | null;
  questionNumber: number;
  totalQuestions: number;
  // --- B3 : etat de manche recu du serveur, seule source de verite ----------
  // Identifiant de la manche affichee : tout roundState plus ancien est jete.
  roundId: number | null;
  // Fin de la question, en ms epoch SERVEUR. Le decompte se calcule par
  // soustraction (deadline - maintenant) et ne peut donc pas deriver.
  deadline: number | null;
  // Ecart mesure entre l'horloge du serveur et celle du navigateur : sans lui,
  // une machine mal reglee afficherait un decompte faux ou negatif.
  serverClockOffset: number;
  phase: 'idle' | 'lobby' | 'question' | 'waiting' | 'reveal' | 'finished';
  myAnswer: string | null;
  otherAnswered: boolean;
  revealData: GameRevealData | null;
  scores: { player1: number; player2: number };
  finalResults: GameFinishedData | null;
  error: string | null;
  reactions: ReactionData[];
  textReactions: TextReactionData[];
  soundReactions: SoundReactionData[];
  // Chat messages for lobby
  chatMessages: ChatMessage[];
  // Pause state when partner disconnects
  gamePaused: boolean;
  disconnectedPlayerName: string | null;
  // New interaction features
  quickMessages: QuickMessageData[];
  lastBuzz: BuzzData | null;
  partnerHesitating: boolean;
  kissCount: number;
  lastKiss: KissData | null;
  // Mode duel : choix du theme de la manche suivante
  duelChoice: ThemeChoiceRequest | null;      // je dois choisir
  duelWaiting: ThemeChoiceWaiting | null;     // j'attends que l'autre choisisse
  duelLastTheme: { name: string; icon: string; autoPicked: boolean } | null;
  // Changement de mode en cours de partie
  modeProposal: ModeProposal | null;                       // on me propose un mode
  currentMode: GameMode;                                   // mode actif
  modeNotice: { text: string; kind: 'changed' | 'declined' } | null;
  // P0-5 : recap des reglages montre au lobby + accord du joueur 2
  gameSettings: RoomSettingsInfo | null;
  // Escalade : montee de palier en attente de l'accord des deux joueurs
  palierRequest: { palier: number; category: { code: string; name: string; icon: string }; timeoutSeconds: number } | null;
  myPalierVote: boolean;
}

type GameAction =
  | { type: 'SET_SOCKET'; socket: Socket<ServerToClientEvents, ClientToServerEvents> }
  | { type: 'SET_CONNECTED'; connected: boolean }
  | { type: 'SET_RECONNECTING'; reconnecting: boolean; attempts?: number }
  | { type: 'ROUND_STATE'; state: RoundState }
  | { type: 'RESUME_PHASE'; phase: ResumePhase; reason?: string | null }
  | { type: 'JOIN_ROOM'; room: Room; playerId: 1 | 2; playerName: string }
  | { type: 'PLAYER_JOINED'; playerName: string; playerId: 1 | 2; gender: Gender }
  | { type: 'PLAYER_LEFT'; playerId: 1 | 2 }
  | { type: 'GAME_STARTED'; gameId: number; gameMode?: GameMode }
  | { type: 'SET_QUESTION'; question: Question; questionNumber: number; totalQuestions: number }
  | { type: 'SET_MY_ANSWER'; answer: string }
  | { type: 'OTHER_ANSWERED' }
  | { type: 'SET_REVEAL'; data: GameRevealData }
  | { type: 'UPDATE_SCORES'; scores: { score1: number; score2: number } }
  | { type: 'GAME_FINISHED'; data: GameFinishedData }
  | { type: 'GAME_RESTARTED' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'ADD_REACTION'; reaction: ReactionData }
  | { type: 'ADD_TEXT_REACTION'; textReaction: TextReactionData }
  | { type: 'ADD_SOUND_REACTION'; soundReaction: SoundReactionData }
  | { type: 'CLEAR_REACTIONS' }
  | { type: 'ADD_CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'CLEAR_CHAT_MESSAGES' }
  | { type: 'GAME_PAUSED'; playerName: string; isManual?: boolean }
  | { type: 'GAME_RESUMED' }
  | { type: 'SET_MANUAL_PAUSE'; paused: boolean }
  | { type: 'ADD_QUICK_MESSAGE'; message: QuickMessageData }
  | { type: 'SET_BUZZ'; buzz: BuzzData }
  | { type: 'CLEAR_BUZZ' }
  | { type: 'SET_PARTNER_HESITATING'; isHesitating: boolean }
  | { type: 'ADD_KISS'; kiss: KissData }
  | { type: 'CLEAR_KISS' }
  | { type: 'DUEL_CHOOSE'; request: ThemeChoiceRequest }
  | { type: 'DUEL_AWAIT'; waiting: ThemeChoiceWaiting }
  | { type: 'DUEL_RESOLVED'; name: string; icon: string; autoPicked: boolean }
  | { type: 'MODE_PROPOSED'; proposal: ModeProposal }
  | { type: 'MODE_CHANGED'; mode: GameMode; label: string; icon: string }
  | { type: 'MODE_DECLINED'; byName: string }
  | { type: 'MODE_CLEAR_PROPOSAL' }
  | { type: 'MODE_CLEAR_NOTICE' }
  | { type: 'SET_ROOM_SETTINGS'; settings: RoomSettingsInfo }
  | { type: 'SETTINGS_ACCEPTED' }
  | { type: 'PALIER_REQUEST'; request: NonNullable<GameState['palierRequest']> }
  | { type: 'PALIER_VOTED' }
  | { type: 'PALIER_RESOLVED' }
  | { type: 'RESET' };

const initialState: GameState = {
  socket: null,
  connected: false,
  reconnecting: false,
  reconnectAttempts: 0,
  resumePhase: 'booting',
  resumeError: null,
  room: null,
  playerId: null,
  playerName: '',
  gameId: null,
  currentQuestion: null,
  questionNumber: 0,
  totalQuestions: 0,
  roundId: null,
  deadline: null,
  serverClockOffset: 0,
  phase: 'idle',
  myAnswer: null,
  otherAnswered: false,
  revealData: null,
  scores: { player1: 0, player2: 0 },
  finalResults: null,
  error: null,
  reactions: [],
  textReactions: [],
  soundReactions: [],
  chatMessages: [],
  gamePaused: false,
  disconnectedPlayerName: null,
  quickMessages: [],
  lastBuzz: null,
  partnerHesitating: false,
  kissCount: 0,
  lastKiss: null,
  duelChoice: null,
  duelWaiting: null,
  duelLastTheme: null,
  modeProposal: null,
  currentMode: 'classic',
  modeNotice: null,
  gameSettings: null,
  palierRequest: null,
  myPalierVote: false
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_SOCKET':
      return { ...state, socket: action.socket };

    case 'SET_CONNECTED':
      return {
        ...state,
        connected: action.connected,
        reconnecting: action.connected ? false : state.reconnecting,
        reconnectAttempts: action.connected ? 0 : state.reconnectAttempts
      };

    case 'SET_RECONNECTING':
      return {
        ...state,
        reconnecting: action.reconnecting,
        reconnectAttempts: action.attempts ?? state.reconnectAttempts
      };

    /**
     * B3 — le serveur dicte, le client affiche.
     *
     * Manche, question, scores des DEUX joueurs et echeance du minuteur
     * arrivent dans un seul paquet : il devient impossible d'afficher la
     * question d'une manche avec le score d'une autre. Les etats en retard
     * (roundId inferieur) sont jetes, donc l'ordre d'arrivee n'importe pas.
     */
    case 'ROUND_STATE': {
      const rs = action.state;
      if (state.roundId !== null && rs.roundId < state.roundId) return state;
      const newRound = rs.roundId !== state.roundId;

      return {
        ...state,
        roundId: rs.roundId,
        currentQuestion: rs.question ?? state.currentQuestion,
        questionNumber: rs.roundNumber,
        totalQuestions: rs.totalQuestions,
        scores: { player1: rs.scores.player1, player2: rs.scores.player2 },
        deadline: rs.deadline,
        // Mesure de l'ecart d'horloge a chaque paquet : le trajet reseau
        // (quelques dizaines de ms) est negligeable devant une question.
        serverClockOffset: rs.serverNow - Date.now(),
        gamePaused: rs.paused,
        disconnectedPlayerName: rs.paused
          ? (rs.pausedReason ?? state.disconnectedPlayerName)
          : null,
        // Une nouvelle manche remet a zero ce qui est propre a la manche.
        // Sur une simple rediffusion (score, pause, reconnexion) on ne touche
        // a rien : effacer la reponse deja posee la ferait ressaisir.
        myAnswer: newRound ? null : state.myAnswer,
        otherAnswered: newRound ? false : state.otherAnswered,
        revealData: newRound ? null : state.revealData,
        // 'waiting' est un etat purement local (j'ai repondu, j'attends
        // l'autre) : le serveur ne le connait pas, on ne l'ecrase donc pas.
        phase: rs.phase === 'reveal'
          ? 'reveal'
          : newRound ? 'question' : (state.phase === 'lobby' ? 'question' : state.phase)
      };
    }

    case 'RESUME_PHASE':
      return {
        ...state,
        resumePhase: action.phase,
        resumeError: action.phase === 'failed' ? action.reason ?? 'Reprise impossible' : null
      };

    case 'JOIN_ROOM':
      // For playing rooms, keep phase as 'lobby' temporarily - the backend will immediately
      // send game:started + game:question events to set the correct phase.
      // For finished rooms, localStorage is already cleared so this shouldn't happen.
      return {
        ...state,
        room: action.room,
        playerId: action.playerId,
        playerName: action.playerName,
        phase: 'lobby',
        error: null,
        // Entrer dans un salon vaut reprise reussie : un echec anterieur ne
        // doit pas continuer a masquer l'ecran de jeu.
        resumePhase: 'live',
        resumeError: null
      };

    case 'PLAYER_JOINED':
      if (!state.room) return state;
      return {
        ...state,
        room: {
          ...state.room,
          [action.playerId === 1 ? 'player1_name' : 'player2_name']: action.playerName,
          [action.playerId === 1 ? 'player1_gender' : 'player2_gender']: action.gender
        }
      };

    case 'PLAYER_LEFT':
      if (!state.room) return state;
      return {
        ...state,
        room: {
          ...state.room,
          [action.playerId === 1 ? 'player1_name' : 'player2_name']: null,
          [action.playerId === 1 ? 'player1_gender' : 'player2_gender']: null
        }
      };

    case 'GAME_STARTED':
      return {
        ...state,
        gameId: action.gameId,
        currentMode: action.gameMode ?? state.currentMode,
        phase: 'question',
        scores: { player1: 0, player2: 0 }
      };

    case 'SET_QUESTION': {
      // Le serveur renvoie la question courante a chaque reconnexion. Traiter
      // ce rappel comme une nouvelle manche effacait la reponse deja posee et
      // la faisait ressaisir : on ne remet a zero que sur un VRAI changement.
      const sameRound =
        state.currentQuestion?.id === action.question.id &&
        state.questionNumber === action.questionNumber;
      return {
        ...state,
        currentQuestion: action.question,
        questionNumber: action.questionNumber,
        totalQuestions: action.totalQuestions,
        phase: sameRound ? state.phase : 'question',
        myAnswer: sameRound ? state.myAnswer : null,
        otherAnswered: sameRound ? state.otherAnswered : false,
        revealData: sameRound ? state.revealData : null
      };
    }

    case 'SET_MY_ANSWER':
      return {
        ...state,
        myAnswer: action.answer,
        phase: state.otherAnswered ? 'reveal' : 'waiting'
      };

    case 'OTHER_ANSWERED':
      return {
        ...state,
        otherAnswered: true,
        phase: state.myAnswer ? 'reveal' : state.phase
      };

    case 'SET_REVEAL':
      return {
        ...state,
        revealData: action.data,
        phase: 'reveal'
      };

    case 'UPDATE_SCORES':
      return {
        ...state,
        scores: { player1: action.scores.score1, player2: action.scores.score2 }
      };

    case 'GAME_FINISHED':
      return {
        ...state,
        finalResults: action.data,
        phase: 'finished'
      };

    case 'GAME_RESTARTED':
      return {
        ...state,
        gameId: null,
        currentQuestion: null,
        questionNumber: 0,
        totalQuestions: 0,
        roundId: null,
        deadline: null,
        phase: 'lobby',
        myAnswer: null,
        otherAnswered: false,
        revealData: null,
        scores: { player1: 0, player2: 0 },
        finalResults: null,
        error: null,
        reactions: [],
        textReactions: [],
        soundReactions: [],
        chatMessages: [],
        gamePaused: false,
        disconnectedPlayerName: null
      };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'SET_ROOM_SETTINGS':
      return { ...state, gameSettings: action.settings };

    case 'SETTINGS_ACCEPTED':
      return state.gameSettings
        ? { ...state, gameSettings: { ...state.gameSettings, settingsAccepted: true } }
        : state;

    case 'PALIER_REQUEST':
      return { ...state, palierRequest: action.request, myPalierVote: false };
    case 'PALIER_VOTED':
      return { ...state, myPalierVote: true };
    case 'PALIER_RESOLVED':
      return { ...state, palierRequest: null, myPalierVote: false };

    case 'MODE_PROPOSED':
      return { ...state, modeProposal: action.proposal };

    case 'MODE_CHANGED':
      return {
        ...state,
        modeProposal: null,
        currentMode: action.mode,
        modeNotice: { text: `${action.icon} Nouveau jeu : ${action.label}`, kind: 'changed' }
      };

    case 'MODE_DECLINED':
      return {
        ...state,
        modeProposal: null,
        modeNotice: { text: `${action.byName} prefere continuer ainsi`, kind: 'declined' }
      };

    case 'MODE_CLEAR_PROPOSAL':
      return { ...state, modeProposal: null };

    case 'MODE_CLEAR_NOTICE':
      return { ...state, modeNotice: null };

    case 'DUEL_CHOOSE':
      return { ...state, duelChoice: action.request, duelWaiting: null };

    case 'DUEL_AWAIT':
      return { ...state, duelWaiting: action.waiting, duelChoice: null };

    case 'DUEL_RESOLVED':
      // Le theme est tranche : on referme les deux ecrans d'attente.
      return {
        ...state,
        duelChoice: null,
        duelWaiting: null,
        duelLastTheme: { name: action.name, icon: action.icon, autoPicked: action.autoPicked }
      };

    case 'ADD_REACTION':
      // Keep only recent reactions (last 10, auto-cleanup old ones)
      const newReactions = [...state.reactions, action.reaction]
        .filter(r => Date.now() - r.timestamp < 5000) // Keep reactions from last 5 seconds
        .slice(-10); // Max 10 reactions
      return { ...state, reactions: newReactions };

    case 'ADD_TEXT_REACTION':
      // Keep only recent text reactions (last 5, auto-cleanup old ones)
      const newTextReactions = [...state.textReactions, action.textReaction]
        .filter(r => Date.now() - r.timestamp < 4000) // Keep reactions from last 4 seconds
        .slice(-5); // Max 5 text reactions
      return { ...state, textReactions: newTextReactions };

    case 'ADD_SOUND_REACTION':
      // Keep only recent sound reactions (last 3, auto-cleanup old ones)
      const newSoundReactions = [...state.soundReactions, action.soundReaction]
        .filter(r => Date.now() - r.timestamp < 3000) // Keep reactions from last 3 seconds
        .slice(-3); // Max 3 sound reactions
      return { ...state, soundReactions: newSoundReactions };

    case 'CLEAR_REACTIONS':
      return { ...state, reactions: [], textReactions: [], soundReactions: [] };

    case 'ADD_CHAT_MESSAGE':
      // Keep last 50 messages
      const newChatMessages = [...state.chatMessages, action.message].slice(-50);
      return { ...state, chatMessages: newChatMessages };

    case 'CLEAR_CHAT_MESSAGES':
      return { ...state, chatMessages: [] };

    case 'GAME_PAUSED':
      return {
        ...state,
        gamePaused: true,
        disconnectedPlayerName: action.playerName
      };

    case 'GAME_RESUMED':
      return {
        ...state,
        gamePaused: false,
        disconnectedPlayerName: null
      };

    case 'SET_MANUAL_PAUSE':
      return {
        ...state,
        gamePaused: action.paused,
        disconnectedPlayerName: action.paused ? 'Pause' : null
      };

    case 'ADD_QUICK_MESSAGE':
      const newQuickMessages = [...state.quickMessages, action.message]
        .filter(m => Date.now() - m.timestamp < 4000)
        .slice(-5);
      return { ...state, quickMessages: newQuickMessages };

    case 'SET_BUZZ':
      return { ...state, lastBuzz: action.buzz };

    case 'CLEAR_BUZZ':
      return { ...state, lastBuzz: null };

    case 'SET_PARTNER_HESITATING':
      return { ...state, partnerHesitating: action.isHesitating };

    case 'ADD_KISS':
      return {
        ...state,
        lastKiss: action.kiss,
        kissCount: action.kiss.totalKisses
      };

    case 'CLEAR_KISS':
      return { ...state, lastKiss: null };

    case 'RESET':
      return {
        ...initialState,
        socket: state.socket,
        connected: state.connected,
        reconnecting: state.reconnecting,
        reconnectAttempts: state.reconnectAttempts,
        // Apres un reset il n'y a plus rien a restaurer : repartir de 'booting'
        // relancerait un ecran d'attente sans raison. Un echec eventuel est
        // repositionne juste apres par un RESUME_PHASE explicite.
        resumePhase: state.connected ? 'live' : 'connecting',
        resumeError: null
      };

    default:
      return state;
  }
}

interface GameContextType extends GameState {
  createRoom: (playerName: string, gender: Gender, questionCount?: number, categories?: string[], questionTypes?: string[], gameMode?: GameMode) => Promise<string>;
  joinRoom: (code: string, playerName: string, gender: Gender) => Promise<string>;
  startGame: () => Promise<void>;
  submitAnswer: (answer: string) => void;
  leaveRoom: () => void;
  resetGame: () => void;
  restartGame: () => Promise<void>;
  sendReaction: (emoji: ReactionEmoji) => void;
  sendTextReaction: (reactionId: TextReactionId) => void;
  sendSoundReaction: (reactionId: SoundReactionId) => void;
  sendChatMessage: (message: string) => void;
  sendQuickMessage: (messageId: QuickMessageId) => void;
  sendBuzz: () => void;
  sendHesitation: (isHesitating: boolean) => void;
  sendKiss: () => void;
  requestPause: () => void;
  clearError: () => void;
  chooseDuelTheme: (category: string) => void;
  proposeMode: (mode: GameMode) => void;
  respondToModeProposal: (accept: boolean) => void;
  dismissModeNotice: () => void;
  acceptSettings: () => void;
  respondPalier: (accept: boolean) => void;
}

const GameContext = createContext<GameContextType | null>(null);

// Session storage helpers
const SESSION_KEY = 'jeucouple_session';
const SESSION_TIMESTAMP_KEY = 'jeucouple_session_ts';
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours max session age

interface StoredSession {
  roomCode: string;
  playerId: 1 | 2;
  playerName: string;
  // Jeton secret remis par le serveur : seule preuve d'appartenance acceptee
  // au room:reconnect (audit securite, P0-1).
  sessionToken?: string;
}

/* -------------------------------------------------------------------------
 * B5 — MULTI-ONGLETS SUR UN MEME APPAREIL
 *
 * Deux onglets du meme navigateur partagent le MEME localStorage. Sans
 * arbitrage, le second onglet reprenait la session du premier : deux clients
 * se declaraient le meme joueur, le serveur en ejectait un, et l'onglet perdant
 * restait affiche mais totalement muet (clic = rien). Or c'est un cas d'usage
 * reel : un couple sur un seul ordinateur ouvre deux onglets.
 *
 * Solution : chaque onglet recoit une identite dans sessionStorage — qui
 * SURVIT au rafraichissement (la reprise apres F5 continue donc de marcher)
 * mais est propre a l'onglet. Un seul onglet a la fois detient la session, via
 * un bail rafraichi en continu. Un onglet neuf ne vole donc plus la session en
 * cours : il demarre vierge et peut rejoindre en tant que second joueur. Si le
 * proprietaire disparait (onglet ferme), son bail expire et le suivant reprend.
 * ------------------------------------------------------------------------- */
const TAB_ID_KEY = 'jeucouple_tab_id';
const SESSION_OWNER_KEY = 'jeucouple_session_owner';
const OWNER_HEARTBEAT_MS = 2000;
// Bail volontairement court : au-dela, on considere l'onglet proprietaire mort.
const OWNER_LEASE_MS = 6000;

function getTabId(): string {
  try {
    let id = sessionStorage.getItem(TAB_ID_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(TAB_ID_KEY, id);
    }
    return id;
  } catch {
    // Sans sessionStorage on ne sait pas distinguer les onglets : on retombe
    // sur l'ancien comportement (un seul onglet utile) plutot que de bloquer.
    return 'onglet-unique';
  }
}

function readSessionOwner(): { tabId: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(SESSION_OWNER_KEY);
    if (!raw) return null;
    const owner = JSON.parse(raw);
    if (typeof owner?.tabId !== 'string' || typeof owner?.ts !== 'number') return null;
    return owner;
  } catch {
    return null;
  }
}

function writeSessionOwner() {
  try {
    localStorage.setItem(SESSION_OWNER_KEY, JSON.stringify({ tabId: getTabId(), ts: Date.now() }));
  } catch (e) {
    console.warn('Impossible d\'ecrire le bail de session:', e);
  }
}

/** Cet onglet a-t-il le droit de reprendre la session stockee ? */
function claimSessionOwnership(): boolean {
  const owner = readSessionOwner();
  const leaseAlive = owner !== null && Date.now() - owner.ts < OWNER_LEASE_MS;
  if (leaseAlive && owner!.tabId !== getTabId()) return false;
  writeSessionOwner();
  return true;
}

/** Un create/join explicite prend la main sans discuter : c'est un acte du joueur. */
function takeSessionOwnership() {
  writeSessionOwner();
}

function releaseSessionOwnership() {
  try {
    const owner = readSessionOwner();
    if (!owner || owner.tabId === getTabId()) localStorage.removeItem(SESSION_OWNER_KEY);
  } catch (e) {
    console.warn('Impossible de liberer le bail de session:', e);
  }
}

function saveSession(roomCode: string, playerId: 1 | 2, playerName: string, sessionToken?: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, playerId, playerName, sessionToken }));
    localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
    takeSessionOwnership();
  } catch (e) {
    console.warn('Failed to save session:', e);
  }
}

function getStoredSession(): StoredSession | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    const timestamp = localStorage.getItem(SESSION_TIMESTAMP_KEY);

    if (!stored) return null;

    // Peremption dure et locale : elle se juge a la LECTURE, avant toute
    // tentative reseau. Elle n'entre donc jamais en concurrence avec le socket.
    if (timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      if (age > SESSION_MAX_AGE_MS) {
        forgetSession(`session vieille de ${Math.round(age / 1000 / 60)} minutes`);
        return null;
      }
    }

    const session = JSON.parse(stored);
    if (!session.roomCode || !session.playerId || !session.playerName) {
      forgetSession('session illisible (champs manquants)');
      return null;
    }
    return session;
  } catch {
    forgetSession('session illisible (JSON invalide)');
    return null;
  }
}

/**
 * SEULE fonction autorisee a effacer la session locale.
 *
 * Elle n'est appelee que sur un verdict explicite : refus du serveur, fin de
 * partie annoncee par le serveur, depart volontaire du joueur, ou peremption
 * locale constatee a la lecture. Jamais sur un simple delai, jamais avant que
 * le socket soit connecte : c'est exactement ce qui produisait l'ecran vide
 * apres refresh (un watchdog effacait la session, puis 'connect' arrivait trop
 * tard pour la restaurer).
 */
function forgetSession(reason: string) {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TIMESTAMP_KEY);
    // Le bail part avec la session : sinon un onglet ferme continuerait a
    // bloquer les suivants pendant la duree du bail.
    releaseSessionOwnership();
    console.log('[reprise] session effacee :', reason);
  } catch (e) {
    console.warn('Failed to clear session:', e);
  }
}

function updateSessionTimestamp() {
  try {
    if (localStorage.getItem(SESSION_KEY)) {
      localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
    }
  } catch (e) {
    console.warn('Failed to update session timestamp:', e);
  }
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  // Cet onglet detient-il le bail sur la session locale ? Seul le detenteur
  // rafraichit le bail, pour qu'un onglet spectateur ne le lui vole pas.
  const ownsSessionRef = useRef(false);

  // Initialize socket connection
  useEffect(() => {
    const socketUrl = import.meta.env.DEV
      ? 'http://localhost:3004'
      : window.location.origin;

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      // B5 : on ne renonce JAMAIS. Avec 5 tentatives, le socket abandonnait au
      // bout d'une quinzaine de secondes ; le badge "Connecte" disparaissait et
      // plus rien ne se reconnectait, laissant une page vivante mais inerte.
      reconnection: true,
      reconnectionAttempts: Infinity,
      // Backoff exponentiel plafonne : rapide sur une micro-coupure, doux sur
      // une panne longue, avec de l'aleatoire pour ne pas synchroniser les
      // clients qui reviennent tous en meme temps apres un redemarrage.
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.5
    });

    // ---------------------------------------------------------------------
    // MACHINE DE REPRISE : booting -> connecting -> restoring -> live | failed
    //
    // Tout passe par ici et par nulle part ailleurs. Avant, trois gardes
    // concurrents (timer de validation, watchdog "phase idle", timeout de
    // reconnexion de 10 s) pouvaient effacer la session pendant que le socket
    // etait encore en train de se connecter : la session disparaissait AVANT
    // 'connect', donc plus rien a restaurer, donc ecran vide definitif.
    // ---------------------------------------------------------------------

    // Delai maximal d'attente d'un accuse de reception du serveur. Passe ce
    // delai on RETENTE, on n'efface surtout pas : un silence reseau n'est pas
    // un refus.
    const RESUME_ACK_TIMEOUT_MS = 4000;
    // Trois retentatives espacees apres l'essai initial : 1 s, 2 s, puis 4 s.
    const RESUME_RETRY_DELAYS_MS = [1000, 2000, 4000];

    // Generation courante de la sequence de reprise. Un socket qui se
    // reconnecte relance une sequence ; ce jeton fait taire les callbacks de
    // l'ancienne, sinon un ack tardif ecraserait l'etat de la nouvelle.
    let resumeRun = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let ackTimer: ReturnType<typeof setTimeout> | null = null;

    const clearResumeTimers = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (ackTimer) { clearTimeout(ackTimer); ackTimer = null; }
    };

    const settleLive = () => {
      clearResumeTimers();
      dispatch({ type: 'RESUME_PHASE', phase: 'live' });
    };

    const settleFailed = (reason: string) => {
      clearResumeTimers();
      console.log('[reprise] echec :', reason);
      dispatch({ type: 'RESUME_PHASE', phase: 'failed', reason });
    };

    const runResumeAttempt = (session: StoredSession, retry: number, run: number) => {
      if (run !== resumeRun) return;

      // Un seul denouement par tentative : soit l'ack du serveur, soit le
      // delai d'attente. Le premier arrive neutralise l'autre.
      let settled = false;

      ackTimer = setTimeout(() => {
        if (settled || run !== resumeRun) return;
        settled = true;
        scheduleRetry(session, retry, run);
      }, RESUME_ACK_TIMEOUT_MS);

      socket.emit('room:reconnect', {
        code: session.roomCode,
        playerId: session.playerId,
        sessionToken: session.sessionToken
      }, (response) => {
        if (settled || run !== resumeRun) return;
        settled = true;
        clearResumeTimers();

        if (response.success && response.room && response.playerId) {
          if (response.room.status === 'finished') {
            // Verdict explicite du serveur : la partie est close.
            forgetSession('le serveur declare la partie terminee');
            settleFailed('Cette partie est deja terminee.');
            return;
          }
          dispatch({
            type: 'JOIN_ROOM',
            room: response.room,
            playerId: response.playerId,
            playerName: session.playerName
          });
          updateSessionTimestamp();
          settleLive();
          return;
        }

        // Le serveur a REPONDU non (salon introuvable, partie finie, jeton
        // invalide). C'est le seul cas ou effacer la session est legitime.
        forgetSession(response.error || 'refus du serveur');
        dispatch({ type: 'RESET' });
        settleFailed(response.error || 'Ce salon n\'existe plus.');
      });
    };

    const scheduleRetry = (session: StoredSession, retry: number, run: number) => {
      const delay = RESUME_RETRY_DELAYS_MS[retry];
      if (delay === undefined) {
        // Retentatives epuisees : on echoue VISIBLEMENT mais on garde la
        // session intacte, le serveur n'ayant jamais dit non.
        settleFailed('Le serveur ne repond pas. Verifie ta connexion.');
        return;
      }
      console.log(`[reprise] pas de reponse, nouvelle tentative dans ${delay} ms`);
      retryTimer = setTimeout(() => runResumeAttempt(session, retry + 1, run), delay);
    };

    // Point d'entree UNIQUE de la reprise : il n'est appelable que depuis
    // l'evenement 'connect', jamais au montage.
    const startResume = () => {
      resumeRun += 1;
      clearResumeTimers();

      const session = getStoredSession();
      if (!session) {
        // Rien a restaurer : l'application est immediatement utilisable.
        settleLive();
        return;
      }

      // Multi-onglets : si un autre onglet vivant detient deja cette session,
      // on ne la lui vole pas. Cet onglet demarre vierge sur l'accueil et peut
      // servir au second joueur du couple, sur le meme ordinateur.
      if (!claimSessionOwnership()) {
        console.log('[reprise] session detenue par un autre onglet : demarrage a neuf');
        ownsSessionRef.current = false;
        settleLive();
        return;
      }
      ownsSessionRef.current = true;

      dispatch({ type: 'RESUME_PHASE', phase: 'restoring' });
      runResumeAttempt(session, 0, resumeRun);
    };

    dispatch({ type: 'RESUME_PHASE', phase: 'connecting' });

    socket.on('connect', () => {
      console.log('Connected to server');
      dispatch({ type: 'SET_CONNECTED', connected: true });
      // La reprise ne demarre QU'ICI : tant que le socket n'est pas connecte,
      // aucune decision sur la session ne peut etre prise.
      startResume();
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      dispatch({ type: 'SET_CONNECTED', connected: false });
      dispatch({ type: 'SET_RECONNECTING', reconnecting: true, attempts: 0 });
      // 'io server disconnect' est le seul cas ou socket.io ne retente pas de
      // lui-meme : on relance explicitement, sinon la page reste morte.
      if (reason === 'io server disconnect') socket.connect();
      // Une sequence de reprise en vol devient caduque : le prochain 'connect'
      // en relancera une propre.
      resumeRun += 1;
      clearResumeTimers();
      // Note : on n'efface plus la session sur 'io server disconnect'. Un
      // redemarrage serveur n'est pas un refus ; si le salon a reellement
      // disparu, le room:reconnect suivant le dira explicitement.
    });

    socket.on('connect_error', (error) => {
      console.log('Connection error:', error.message);
      // Erreur potentiellement temporaire : socket.io retente seul, on ne
      // touche ni a la session ni a l'etat de reprise.
    });

    socket.io.on('reconnect', () => {
      console.log('Socket.io manager reconnected');
      // 'connect' suit immediatement et relance startResume().
    });

    // Le bandeau "reconnexion en cours" s'appuie sur ces deux evenements :
    // sans eux, l'interface n'avait aucun moyen de dire au joueur ce qui se
    // passait, et une page morte ressemblait a une page normale.
    socket.io.on('reconnect_attempt', (attempt: number) => {
      dispatch({ type: 'SET_RECONNECTING', reconnecting: true, attempts: attempt });
    });
    socket.io.on('reconnect_error', () => {
      dispatch({ type: 'SET_RECONNECTING', reconnecting: true });
    });

    socket.on('room:player-joined', (data) => {
      dispatch({ type: 'PLAYER_JOINED', playerName: data.playerName, playerId: data.playerId, gender: data.gender });
    });

    socket.on('room:player-left', (data) => {
      dispatch({ type: 'PLAYER_LEFT', playerId: data.playerId });
    });

    socket.on('game:started', (data) => {
      dispatch({ type: 'GAME_STARTED', gameId: data.gameId, gameMode: data.gameMode });
    });

    socket.on('game:question', (data) => {
      dispatch({
        type: 'SET_QUESTION',
        question: data.question,
        questionNumber: data.questionNumber,
        totalQuestions: data.totalQuestions
      });
    });

    socket.on('game:player-answered', () => {
      dispatch({ type: 'OTHER_ANSWERED' });
    });

    socket.on('game:reveal', (data) => {
      dispatch({ type: 'SET_REVEAL', data });
    });

    socket.on('game:score-update', (data) => {
      dispatch({ type: 'UPDATE_SCORES', scores: data });
    });

    // B3 : etat complet de la manche. C'est LUI qui fait autorite ; les
    // evenements partiels ci-dessus restent pour les animations, mais ne
    // peuvent plus faire diverger deux clients.
    socket.on('game:round-state', (data) => {
      dispatch({ type: 'ROUND_STATE', state: data });
    });

    socket.on('game:finished', (data) => {
      // Verdict explicite du serveur : la partie est finie, la session n'a
      // plus rien a restaurer.
      forgetSession('partie terminee (game:finished)');
      dispatch({ type: 'GAME_FINISHED', data });
    });

    socket.on('game:restarted', () => {
      dispatch({ type: 'GAME_RESTARTED' });
    });

    socket.on('game:reaction', (data) => {
      dispatch({ type: 'ADD_REACTION', reaction: data });
    });

    socket.on('game:text-reaction', (data) => {
      dispatch({ type: 'ADD_TEXT_REACTION', textReaction: data });
    });

    socket.on('game:sound-reaction', (data) => {
      dispatch({ type: 'ADD_SOUND_REACTION', soundReaction: data });
    });

    socket.on('lobby:chat', (data) => {
      dispatch({ type: 'ADD_CHAT_MESSAGE', message: data });
    });

    socket.on('game:quick-message', (data) => {
      dispatch({ type: 'ADD_QUICK_MESSAGE', message: data });
    });

    socket.on('game:buzz', (data) => {
      dispatch({ type: 'SET_BUZZ', buzz: data });
      // Auto-clear buzz after 1.5 seconds
      setTimeout(() => dispatch({ type: 'CLEAR_BUZZ' }), 1500);
    });

    socket.on('game:hesitation', (data) => {
      dispatch({ type: 'SET_PARTNER_HESITATING', isHesitating: data.isHesitating });
    });

    socket.on('game:kiss', (data) => {
      dispatch({ type: 'ADD_KISS', kiss: data });
      // Auto-clear kiss display after 2 seconds
      setTimeout(() => dispatch({ type: 'CLEAR_KISS' }), 2000);
    });

    socket.on('escalade:palier', (data) => {
      dispatch({ type: 'PALIER_REQUEST', request: data });
    });
    socket.on('escalade:palier-result', () => {
      dispatch({ type: 'PALIER_RESOLVED' });
    });

    socket.on('room:settings', (data) => {
      dispatch({ type: 'SET_ROOM_SETTINGS', settings: data });
    });

    socket.on('room:settings-accepted', () => {
      dispatch({ type: 'SETTINGS_ACCEPTED' });
    });

    socket.on('mode:proposal', (data) => {
      dispatch({ type: 'MODE_PROPOSED', proposal: data });
    });

    socket.on('mode:changed', (data) => {
      dispatch({ type: 'MODE_CHANGED', mode: data.mode, label: data.label, icon: data.icon });
    });

    socket.on('mode:declined', (data) => {
      dispatch({ type: 'MODE_DECLINED', byName: data.byName });
    });

    socket.on('duel:choose-theme', (data) => {
      dispatch({ type: 'DUEL_CHOOSE', request: data });
    });

    socket.on('duel:awaiting-theme', (data) => {
      dispatch({ type: 'DUEL_AWAIT', waiting: data });
    });

    socket.on('duel:theme-selected', (data) => {
      dispatch({ type: 'DUEL_RESOLVED', name: data.name, icon: data.icon, autoPicked: data.autoPicked });
    });

    socket.on('game:paused', (data) => {
      console.log('Game paused, waiting for:', data.playerName);
      dispatch({ type: 'GAME_PAUSED', playerName: data.playerName });
    });

    socket.on('game:resumed', (data) => {
      console.log('Game resumed, player reconnected:', data.playerName);
      dispatch({ type: 'GAME_RESUMED' });
    });

    socket.on('error', (data) => {
      dispatch({ type: 'SET_ERROR', error: data.message });
      // Refus explicite du serveur sur l'existence du salon : verdict, donc
      // effacement legitime.
      if (data.message.toLowerCase().includes('room not found') ||
          data.message.toLowerCase().includes('invalid room') ||
          data.message.toLowerCase().includes('session expired')) {
        forgetSession(`erreur serveur : ${data.message}`);
        dispatch({ type: 'RESET' });
        settleFailed(data.message);
      }
    });

    // Handle room:kicked event (when server removes player from room)
    socket.on('room:kicked' as keyof ServerToClientEvents, () => {
      // Verdict explicite : le serveur nous a sorti du salon.
      forgetSession('exclu du salon par le serveur');
      dispatch({ type: 'RESET' });
      settleFailed('Tu as ete retire de ce salon.');
    });

    dispatch({ type: 'SET_SOCKET', socket });

    // Retour d'onglet : on se contente de rafraichir l'horodatage pour que la
    // session ne perime pas pendant une longue partie. Cette poignee ne juge
    // plus la validite de la session (c'etait un des gardes concurrents).
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateSessionTimestamp();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle beforeunload - notify server and clear session cleanly
    const handleBeforeUnload = () => {
      const session = getStoredSession();
      if (session && socket.connected) {
        // Try to notify server about leaving (synchronous)
        socket.emit('room:leave');
      }
      // Note: We intentionally do NOT clear the session on beforeunload
      // to allow reconnection if the user navigates back quickly.
      // The session will expire after SESSION_MAX_AGE_MS anyway.
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // L'ancien intervalle de "validation de session" toutes les 5 minutes
    // renvoyait un room:reconnect de controle et effacait la session au moindre
    // refus, en concurrence avec la sequence de reprise. Il ne reste qu'un
    // rafraichissement d'horodatage : il ne decide plus rien.
    const sessionKeepAliveInterval = setInterval(updateSessionTimestamp, 5 * 60 * 1000);

    // Bail multi-onglets : seul l'onglet detenteur le rafraichit. Quand il se
    // ferme, le bail perime tout seul et un autre onglet peut reprendre la
    // partie — c'est ce qui evite qu'une session reste bloquee pour toujours.
    const ownershipInterval = setInterval(() => {
      if (ownsSessionRef.current && localStorage.getItem(SESSION_KEY)) writeSessionOwner();
    }, OWNER_HEARTBEAT_MS);

    return () => {
      // Cleanup all listeners and timers
      resumeRun += 1;
      clearResumeTimers();
      clearInterval(sessionKeepAliveInterval);
      clearInterval(ownershipInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      socket.disconnect();
    };
  }, []);

  // Les deux effets qui vivaient ici ont ete supprimes :
  //  - "phase idle sans room => effacer la session" se declenchait au tout
  //    premier rendu, donc AVANT 'connect', et detruisait la session qu'on
  //    s'appretait justement a restaurer (c'est le bug de prod) ;
  //  - "phase finished => effacer la session" doublonnait avec le handler
  //    game:finished.
  // L'effacement est desormais centralise dans forgetSession().

  const createRoom = useCallback(async (playerName: string, gender: Gender, questionCount?: number, categories?: string[], questionTypes?: string[], gameMode?: GameMode): Promise<string> => {
    // B5 : hors connexion on le DIT. L'ancienne version partait quand meme et
    // l'ack ne revenait jamais : bouton sans effet et sans message.
    if (!state.socket || !state.connected) {
      const message = 'Connexion perdue. Reconnexion en cours...';
      dispatch({ type: 'SET_ERROR', error: message });
      throw new Error(message);
    }

    return new Promise<string>((resolve, reject) => {
      state.socket!.emit('room:create', { playerName, gender, questionCount, categories, questionTypes, gameMode }, (response) => {
        if (response.success && response.room && response.playerId) {
          dispatch({
            type: 'JOIN_ROOM',
            room: response.room,
            playerId: response.playerId,
            playerName
          });
          saveSession(response.room.code, response.playerId, playerName, response.sessionToken);
          // Cet onglet vient d'entrer dans un salon : il devient detenteur du
          // bail (multi-onglets), c'est lui qui reprendra apres un refresh.
          ownsSessionRef.current = true;
          resolve(response.room.code); // Return the room code
        } else {
          dispatch({ type: 'SET_ERROR', error: response.error || 'Failed to create room' });
          reject(new Error(response.error));
        }
      });
    });
  }, [state.socket, state.connected]);

  const joinRoom = useCallback(async (code: string, playerName: string, gender: Gender): Promise<string> => {
    if (!state.socket || !state.connected) {
      const message = 'Connexion perdue. Reconnexion en cours...';
      dispatch({ type: 'SET_ERROR', error: message });
      throw new Error(message);
    }

    return new Promise<string>((resolve, reject) => {
      state.socket!.emit('room:join', { code: code.toUpperCase(), playerName, gender }, (response) => {
        if (response.success && response.room && response.playerId) {
          dispatch({
            type: 'JOIN_ROOM',
            room: response.room,
            playerId: response.playerId,
            playerName
          });
          saveSession(response.room.code, response.playerId, playerName, response.sessionToken);
          // Cet onglet vient d'entrer dans un salon : il devient detenteur du
          // bail (multi-onglets), c'est lui qui reprendra apres un refresh.
          ownsSessionRef.current = true;
          resolve(response.room.code); // Return the room code
        } else {
          dispatch({ type: 'SET_ERROR', error: response.error || 'Failed to join room' });
          reject(new Error(response.error));
        }
      });
    });
  }, [state.socket, state.connected]);

  const startGame = useCallback(async () => {
    if (!state.socket) return;

    return new Promise<void>((resolve, reject) => {
      state.socket!.emit('game:start', (response) => {
        if (response.success) {
          resolve();
        } else {
          dispatch({ type: 'SET_ERROR', error: response.error || 'Failed to start game' });
          reject(new Error(response.error));
        }
      });
    });
  }, [state.socket]);

  const submitAnswer = useCallback((answer: string) => {
    // Prevent submitting if no socket, already answered, or not in question phase
    if (!state.socket || state.myAnswer || state.phase !== 'question') return;

    // Ack serveur (P0-2 du plan d'audit) : la reponse n'est consideree comme
    // posee que si le serveur l'accepte ; un refus est affiche, jamais une
    // troncature silencieuse. Filet : sans ack sous 3 s (vieux serveur),
    // on retombe sur l'ancien comportement optimiste.
    let settled = false;
    const fallback = setTimeout(() => {
      if (!settled) {
        settled = true;
        dispatch({ type: 'SET_MY_ANSWER', answer });
      }
    }, 3000);

    state.socket.emit('game:answer', { answer }, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      if (res?.accepted) {
        dispatch({ type: 'SET_MY_ANSWER', answer });
      } else {
        dispatch({ type: 'SET_ERROR', error: res?.error || 'Reponse refusee, reessaie' });
      }
    });
  }, [state.socket, state.myAnswer, state.phase]);

  const leaveRoom = useCallback(() => {
    if (state.socket) {
      state.socket.emit('room:leave');
    }
    // Geste volontaire du joueur : verdict aussi explicite qu'un refus serveur.
    forgetSession('depart volontaire du salon');
    dispatch({ type: 'RESET' });
  }, [state.socket]);

  const resetGame = useCallback(() => {
    forgetSession('remise a zero demandee par le joueur');
    dispatch({ type: 'RESET' });
  }, []);

  const restartGame = useCallback(async () => {
    if (!state.socket) return;

    return new Promise<void>((resolve, reject) => {
      state.socket!.emit('game:restart', (response) => {
        if (response.success) {
          resolve();
        } else {
          dispatch({ type: 'SET_ERROR', error: response.error || 'Failed to restart game' });
          reject(new Error(response.error));
        }
      });
    });
  }, [state.socket]);

  const sendReaction = useCallback((emoji: ReactionEmoji) => {
    if (!state.socket) return;
    state.socket.emit('game:reaction', { emoji });
  }, [state.socket]);

  const sendTextReaction = useCallback((reactionId: TextReactionId) => {
    if (!state.socket) return;
    state.socket.emit('game:text-reaction', { reactionId });
  }, [state.socket]);

  const sendSoundReaction = useCallback((reactionId: SoundReactionId) => {
    if (!state.socket) return;
    state.socket.emit('game:sound-reaction', { reactionId });
  }, [state.socket]);

  const sendChatMessage = useCallback((message: string) => {
    if (!state.socket) return;
    const trimmed = message.trim();
    if (!trimmed) return;
    state.socket.emit('lobby:chat', { message: trimmed });
  }, [state.socket]);

  const sendQuickMessage = useCallback((messageId: QuickMessageId) => {
    if (!state.socket) return;
    state.socket.emit('game:quick-message', { messageId });
  }, [state.socket]);

  const sendBuzz = useCallback(() => {
    if (!state.socket) return;
    state.socket.emit('game:buzz');
  }, [state.socket]);

  const sendHesitation = useCallback((isHesitating: boolean) => {
    if (!state.socket) return;
    state.socket.emit('game:hesitation', { isHesitating });
  }, [state.socket]);

  const sendKiss = useCallback(() => {
    if (!state.socket) return;
    state.socket.emit('game:kiss');
  }, [state.socket]);

  const requestPause = useCallback(() => {
    if (!state.socket) return;
    state.socket.emit('game:request-pause', (response: { success: boolean; paused?: boolean }) => {
      if (response.success && response.paused !== undefined) {
        dispatch({ type: 'SET_MANUAL_PAUSE', paused: response.paused });
      }
    });
  }, [state.socket]);

  // L'action CLEAR_ERROR existait dans le reducer mais n'etait jamais declenchee :
  // une fois affichee, la banniere d'erreur rouge restait a l'ecran indefiniment,
  // y compris apres un nouvel essai reussi ou un changement d'ecran.
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const proposeMode = useCallback((mode: GameMode) => {
    if (!state.socket) return;
    state.socket.emit('mode:propose', { mode });
  }, [state.socket]);

  const respondToModeProposal = useCallback((accept: boolean) => {
    if (!state.socket) return;
    state.socket.emit('mode:respond', { accept });
    // On referme tout de suite : le serveur ignore les reponses en double.
    dispatch({ type: 'MODE_CLEAR_PROPOSAL' });
  }, [state.socket]);

  const dismissModeNotice = useCallback(() => {
    dispatch({ type: 'MODE_CLEAR_NOTICE' });
  }, []);

  const respondPalier = useCallback((accept: boolean) => {
    if (!state.socket) return;
    state.socket.emit('escalade:palier-respond', { accept });
    // Un refus ferme tout de suite (le serveur tranche a un seul non) ;
    // un oui passe en "j'attends l'autre".
    dispatch({ type: accept ? 'PALIER_VOTED' : 'PALIER_RESOLVED' });
  }, [state.socket]);

  const acceptSettings = useCallback(() => {
    // La confirmation revient par room:settings-accepted, diffuse aux deux.
    state.socket?.emit('room:accept-settings');
  }, [state.socket]);

  const chooseDuelTheme = useCallback((category: string) => {
    if (!state.socket) return;
    state.socket.emit('duel:choose-theme', { category });
    // On referme immediatement l'ecran de choix : le serveur ignore les envois
    // en double, mais laisser le bouton actif inviterait au double-clic.
    dispatch({ type: 'DUEL_RESOLVED', name: '', icon: '', autoPicked: false });
  }, [state.socket]);

  return (
    <GameContext.Provider
      value={{
        ...state,
        clearError,
        chooseDuelTheme,
        proposeMode,
        respondToModeProposal,
        dismissModeNotice,
        acceptSettings,
        respondPalier,
        createRoom,
        joinRoom,
        startGame,
        submitAnswer,
        leaveRoom,
        resetGame,
        restartGame,
        sendReaction,
        sendTextReaction,
        sendSoundReaction,
        sendChatMessage,
        sendQuickMessage,
        sendBuzz,
        sendHesitation,
        sendKiss,
        requestPause
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
