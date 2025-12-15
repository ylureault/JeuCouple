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
  ReactionData
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
  | { type: 'CLEAR_REACTIONS' }
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
  reactions: []
};

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_SOCKET':
      return { ...state, socket: action.socket };

    case 'SET_CONNECTED':
      return { ...state, connected: action.connected };

    case 'JOIN_ROOM':
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
        error: null
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

    case 'CLEAR_REACTIONS':
      return { ...state, reactions: [] };

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
  createRoom: (playerName: string, gender: Gender, questionCount?: number) => Promise<void>;
  joinRoom: (code: string, playerName: string, gender: Gender) => Promise<void>;
  startGame: () => Promise<void>;
  submitAnswer: (answer: string) => void;
  leaveRoom: () => void;
  resetGame: () => void;
  restartGame: () => Promise<void>;
  sendReaction: (emoji: ReactionEmoji) => void;
}

const GameContext = createContext<GameContextType | null>(null);

// Session storage helpers
const SESSION_KEY = 'jeucouple_session';

interface StoredSession {
  roomCode: string;
  playerId: 1 | 2;
  playerName: string;
}

function saveSession(roomCode: string, playerId: 1 | 2, playerName: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, playerId, playerName }));
}

function getStoredSession(): StoredSession | null {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
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
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      dispatch({ type: 'SET_CONNECTED', connected: true });

      // Try to reconnect to existing session
      const session = getStoredSession();
      if (session) {
        socket.emit('room:reconnect', {
          code: session.roomCode,
          playerId: session.playerId
        }, (response) => {
          if (response.success && response.room && response.playerId) {
            dispatch({
              type: 'JOIN_ROOM',
              room: response.room,
              playerId: response.playerId,
              playerName: session.playerName
            });
          } else {
            // Session invalid, clear it
            clearSession();
          }
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      dispatch({ type: 'SET_CONNECTED', connected: false });
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
      dispatch({ type: 'GAME_FINISHED', data });
    });

    socket.on('game:restarted', () => {
      dispatch({ type: 'GAME_RESTARTED' });
    });

    socket.on('game:reaction', (data) => {
      dispatch({ type: 'ADD_REACTION', reaction: data });
    });

    socket.on('error', (data) => {
      dispatch({ type: 'SET_ERROR', error: data.message });
    });

    dispatch({ type: 'SET_SOCKET', socket });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback(async (playerName: string, gender: Gender, questionCount?: number) => {
    if (!state.socket) return;

    return new Promise<void>((resolve, reject) => {
      state.socket!.emit('room:create', { playerName, gender, questionCount }, (response) => {
        if (response.success && response.room && response.playerId) {
          dispatch({
            type: 'JOIN_ROOM',
            room: response.room,
            playerId: response.playerId,
            playerName
          });
          saveSession(response.room.code, response.playerId, playerName);
          resolve();
        } else {
          dispatch({ type: 'SET_ERROR', error: response.error || 'Failed to create room' });
          reject(new Error(response.error));
        }
      });
    });
  }, [state.socket]);

  const joinRoom = useCallback(async (code: string, playerName: string, gender: Gender) => {
    if (!state.socket) return;

    return new Promise<void>((resolve, reject) => {
      state.socket!.emit('room:join', { code: code.toUpperCase(), playerName, gender }, (response) => {
        if (response.success && response.room && response.playerId) {
          dispatch({
            type: 'JOIN_ROOM',
            room: response.room,
            playerId: response.playerId,
            playerName
          });
          saveSession(response.room.code, response.playerId, playerName);
          resolve();
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
    if (!state.socket || state.myAnswer) return;

    state.socket.emit('game:answer', { answer });
    dispatch({ type: 'SET_MY_ANSWER', answer });
  }, [state.socket, state.myAnswer]);

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
        sendReaction
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
