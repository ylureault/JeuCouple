// Types partagés entre frontend et backend

export type QuestionType = 'A' | 'B' | 'C' | 'D';

export interface Question {
  id: number;
  type: QuestionType;
  category: string;
  text: string;
  options?: string[];
  timer: number;
  active: boolean;
}

export interface Room {
  id: number;
  code: string;
  player1_name: string | null;
  player2_name: string | null;
  status: 'waiting' | 'playing' | 'finished';
  created_at: string;
  last_activity: string;
}

export interface Game {
  id: number;
  room_id: number;
  started_at: string;
  finished_at: string | null;
  score_player1: number;
  score_player2: number;
}

export interface Answer {
  id: number;
  game_id: number;
  question_id: number;
  player_id: 1 | 2;
  answer: string;
  answered_at: string;
}

// Socket.IO Events
export interface ServerToClientEvents {
  'room:joined': (data: { room: Room; playerId: 1 | 2 }) => void;
  'room:player-joined': (data: { playerName: string; playerId: 1 | 2 }) => void;
  'room:player-left': (data: { playerId: 1 | 2 }) => void;
  'game:started': (data: { gameId: number }) => void;
  'game:question': (data: { question: Question; questionNumber: number; totalQuestions: number }) => void;
  'game:player-answered': (data: { playerId: 1 | 2 }) => void;
  'game:reveal': (data: GameRevealData) => void;
  'game:score-update': (data: { score1: number; score2: number }) => void;
  'game:finished': (data: GameFinishedData) => void;
  'error': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': (data: { playerName: string }, callback: (response: RoomResponse) => void) => void;
  'room:join': (data: { code: string; playerName: string }, callback: (response: RoomResponse) => void) => void;
  'room:leave': () => void;
  'game:start': (callback: (response: { success: boolean; error?: string }) => void) => void;
  'game:answer': (data: { answer: string }) => void;
  'room:reconnect': (data: { code: string; playerId: 1 | 2 }, callback: (response: RoomResponse) => void) => void;
}

export interface RoomResponse {
  success: boolean;
  room?: Room;
  playerId?: 1 | 2;
  error?: string;
}

export interface GameRevealData {
  questionId: number;
  answer1: string | null;
  answer2: string | null;
  correct: boolean;
  points1: number;
  points2: number;
  questionType: QuestionType;
}

export interface GameFinishedData {
  score1: number;
  score2: number;
  winner: 1 | 2 | 'tie';
  totalQuestions: number;
  correctAnswers1: number;
  correctAnswers2: number;
}

// Admin types
export interface AdminStats {
  activeRooms: number;
  totalGames: number;
  totalQuestions: number;
  questionsByType: Record<QuestionType, number>;
}

export interface QuestionImport {
  questions: Omit<Question, 'id' | 'active'>[];
}
