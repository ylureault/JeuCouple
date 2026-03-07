import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
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
  KissData
} from '../../../shared/types';

interface GameState {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connected: boolean;
  room: Room | null;
  playerId: 1 | 2 | null;
  playerName: string;
  gameId: number | null;
  currentQuestion: Question | null;
  questionNumber: number;
  totalQuestions: number;
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
}

type GameAction =
  | { type: 'SET_SOCKET'; socket: Socket<ServerToClientEvents, ClientToServerEvents> }
  | { type: 'SET_CONNECTED'; connected: boolean }
  | { type: 'JOIN_ROOM'; room: Room; playerId: 1 | 2; playerName: string }
  | { type: 'PLAYER_JOINED'; playerName: string; playerId: 1 | 2; gender: Gender }
  | { type: 'PLAYER_LEFT'; playerId: 1 | 2 }
  | { type: 'GAME_STARTED'; gameId: number }
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
  | { type: 'RESET' };

const initialState: GameState = {
  socket: null,
  connected: false,
  room: null,
  playerId: null,
  playerName: '',
  gameId: null,
  currentQuestion: null,
  questionNumber: 0,
  totalQuestions: 0,
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
  lastKiss: null
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_SOCKET':
      return { ...state, socket: action.socket };

    case 'SET_CONNECTED':
      return { ...state, connected: action.connected };

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
        error: null
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
        phase: 'question',
        scores: { player1: 0, player2: 0 }
      };

    case 'SET_QUESTION':
      return {
        ...state,
        currentQuestion: action.question,
        questionNumber: action.questionNumber,
        totalQuestions: action.totalQuestions,
        phase: 'question',
        myAnswer: null,
        otherAnswered: false,
        revealData: null
      };

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
        connected: state.connected
      };

    default:
      return state;
  }
}

interface GameContextType extends GameState {
  createRoom: (playerName: string, gender: Gender, questionCount?: number, categories?: string[], questionTypes?: string[]) => Promise<string>;
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
}

function saveSession(roomCode: string, playerId: 1 | 2, playerName: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, playerId, playerName }));
    localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());
  } catch (e) {
    console.warn('Failed to save session:', e);
  }
}

function getStoredSession(): StoredSession | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    const timestamp = localStorage.getItem(SESSION_TIMESTAMP_KEY);

    if (!stored) return null;

    // Check if session is too old
    if (timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      if (age > SESSION_MAX_AGE_MS) {
        console.log('Session expired (age:', Math.round(age / 1000 / 60), 'minutes)');
        clearSession();
        return null;
      }
    }

    const session = JSON.parse(stored);
    // Validate session structure
    if (!session.roomCode || !session.playerId || !session.playerName) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TIMESTAMP_KEY);
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

  // Initialize socket connection
  useEffect(() => {
    const socketUrl = import.meta.env.DEV
      ? 'http://localhost:3004'
      : window.location.origin;

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(socketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    // Track if we're currently trying to reconnect to prevent duplicate attempts
    let reconnectAttemptPending = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const attemptReconnect = (session: StoredSession) => {
      if (reconnectAttemptPending) return;
      reconnectAttemptPending = true;

      // Set a timeout for the reconnection attempt
      reconnectTimeout = setTimeout(() => {
        console.log('Reconnection timeout - clearing session');
        clearSession();
        reconnectAttemptPending = false;
      }, 10000); // 10 second timeout

      socket.emit('room:reconnect', {
        code: session.roomCode,
        playerId: session.playerId
      }, (response) => {
        // Clear the timeout since we got a response
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        reconnectAttemptPending = false;

        if (response.success && response.room && response.playerId) {
          // Check if room is in a valid state (not finished)
          if (response.room.status === 'finished') {
            console.log('Room is finished, clearing session');
            clearSession();
            return;
          }
          dispatch({
            type: 'JOIN_ROOM',
            room: response.room,
            playerId: response.playerId,
            playerName: session.playerName
          });
          updateSessionTimestamp();
        } else {
          // Session invalid, clear it
          console.log('Reconnection failed:', response.error);
          clearSession();
        }
      });
    };

    socket.on('connect', () => {
      console.log('Connected to server');
      dispatch({ type: 'SET_CONNECTED', connected: true });

      // Try to reconnect to existing session
      const session = getStoredSession();
      if (session) {
        attemptReconnect(session);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      dispatch({ type: 'SET_CONNECTED', connected: false });

      // If server disconnected us, it might mean the room is invalid
      if (reason === 'io server disconnect') {
        console.log('Server disconnected us, clearing session');
        clearSession();
        dispatch({ type: 'RESET' });
      }
    });

    socket.on('connect_error', (error) => {
      console.log('Connection error:', error.message);
      // Don't clear session immediately on connection errors - might be temporary
    });

    // Handle reconnection after socket reconnects
    // Note: When socket.io reconnects, it will fire 'connect' again,
    // which will trigger attemptReconnect. This io.on('reconnect') is for
    // the socket.io manager level reconnect event.
    socket.io.on('reconnect', () => {
      console.log('Socket.io manager reconnected');
      // The 'connect' event will be fired next, which handles the session reconnection
    });

    socket.on('room:player-joined', (data) => {
      dispatch({ type: 'PLAYER_JOINED', playerName: data.playerName, playerId: data.playerId, gender: data.gender });
    });

    socket.on('room:player-left', (data) => {
      dispatch({ type: 'PLAYER_LEFT', playerId: data.playerId });
    });

    socket.on('game:started', (data) => {
      dispatch({ type: 'GAME_STARTED', gameId: data.gameId });
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

    socket.on('game:finished', (data) => {
      // Clear stale session so reconnect doesn't try to rejoin a finished game
      clearSession();
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
      // If error indicates room doesn't exist, clear session
      if (data.message.toLowerCase().includes('room not found') ||
          data.message.toLowerCase().includes('invalid room') ||
          data.message.toLowerCase().includes('session expired')) {
        clearSession();
        dispatch({ type: 'RESET' });
      }
    });

    // Handle room:kicked event (when server removes player from room)
    socket.on('room:kicked' as keyof ServerToClientEvents, () => {
      console.log('Kicked from room by server');
      clearSession();
      dispatch({ type: 'RESET' });
    });

    dispatch({ type: 'SET_SOCKET', socket });

    // Handle page visibility changes - validate session when becoming visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const session = getStoredSession();
        if (session && socket.connected && !reconnectAttemptPending) {
          // Re-validate session when page becomes visible
          updateSessionTimestamp();
        }
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

    // Periodic session validation (every 5 minutes)
    const sessionValidationInterval = setInterval(() => {
      const session = getStoredSession();
      if (!session) return;

      // If we have a session but we're not in a room, something is wrong
      if (session && socket.connected) {
        // Ping the server to check if room still exists
        socket.emit('room:reconnect', {
          code: session.roomCode,
          playerId: session.playerId
        }, (response) => {
          if (!response.success) {
            console.log('Session validation failed, clearing session');
            clearSession();
            dispatch({ type: 'RESET' });
          } else if (response.room?.status === 'finished') {
            console.log('Room is finished, clearing session');
            clearSession();
            dispatch({ type: 'RESET' });
          } else {
            updateSessionTimestamp();
          }
        });
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => {
      // Cleanup all listeners and timers
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      clearInterval(sessionValidationInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      socket.disconnect();
    };
  }, []);

  // Clean up session when phase returns to idle without a room
  useEffect(() => {
    if (state.phase === 'idle' && !state.room) {
      // Clear any stale session when we're back to idle with no room
      const session = getStoredSession();
      if (session) {
        console.log('Phase is idle with no room, clearing session');
        clearSession();
      }
    }
  }, [state.phase, state.room]);

  // Clear session when game is finished and we go back to results
  useEffect(() => {
    if (state.phase === 'finished') {
      // Session is cleared in game:finished handler, but double-check
      clearSession();
    }
  }, [state.phase]);

  const createRoom = useCallback(async (playerName: string, gender: Gender, questionCount?: number, categories?: string[], questionTypes?: string[]): Promise<string> => {
    if (!state.socket) throw new Error('No socket connection');

    return new Promise<string>((resolve, reject) => {
      state.socket!.emit('room:create', { playerName, gender, questionCount, categories, questionTypes }, (response) => {
        if (response.success && response.room && response.playerId) {
          dispatch({
            type: 'JOIN_ROOM',
            room: response.room,
            playerId: response.playerId,
            playerName
          });
          saveSession(response.room.code, response.playerId, playerName);
          resolve(response.room.code); // Return the room code
        } else {
          dispatch({ type: 'SET_ERROR', error: response.error || 'Failed to create room' });
          reject(new Error(response.error));
        }
      });
    });
  }, [state.socket]);

  const joinRoom = useCallback(async (code: string, playerName: string, gender: Gender): Promise<string> => {
    if (!state.socket) throw new Error('No socket connection');

    return new Promise<string>((resolve, reject) => {
      state.socket!.emit('room:join', { code: code.toUpperCase(), playerName, gender }, (response) => {
        if (response.success && response.room && response.playerId) {
          dispatch({
            type: 'JOIN_ROOM',
            room: response.room,
            playerId: response.playerId,
            playerName
          });
          saveSession(response.room.code, response.playerId, playerName);
          resolve(response.room.code); // Return the room code
        } else {
          dispatch({ type: 'SET_ERROR', error: response.error || 'Failed to join room' });
          reject(new Error(response.error));
        }
      });
    });
  }, [state.socket]);

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

    state.socket.emit('game:answer', { answer });
    dispatch({ type: 'SET_MY_ANSWER', answer });
  }, [state.socket, state.myAnswer, state.phase]);

  const leaveRoom = useCallback(() => {
    if (state.socket) {
      state.socket.emit('room:leave');
    }
    clearSession();
    dispatch({ type: 'RESET' });
  }, [state.socket]);

  const resetGame = useCallback(() => {
    clearSession();
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

  return (
    <GameContext.Provider
      value={{
        ...state,
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
