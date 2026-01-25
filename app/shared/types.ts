// Types partagés entre frontend et backend

// Extended question types: A, B, C, D + new E (binary choice), F (who of us), G (vrai ou faux about player), H (culture générale QCM), I (image-based choice)
export type QuestionType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

// Scoring modes for question types
// 'individual' for Type H: each player scores independently based on correct answer
export type ScoringMode = 'match' | 'consensus' | 'proximity' | 'none' | 'individual';

// Input types for questions
// 'qcm' for Type H: multiple choice with one correct answer
// 'image_choice' for Type I: visual emoji-based choice between two options
export type InputType = 'options' | 'binary' | 'scale' | 'text' | 'who' | 'qcm' | 'image_choice';

// Question Type Configuration (administrable)
export interface QuestionTypeConfig {
  id: number;
  code: string;
  name: string;
  description: string;
  scoring_mode: ScoringMode;
  input_type: InputType;
  icon: string;
  color: string;
  active: boolean;
}

// Category (administrable)
export interface Category {
  id: number;
  code: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  active: boolean;
  sort_order: number;
}

export interface Question {
  id: number;
  type: QuestionType;
  category: string;
  text: string;
  options?: string[];
  option_a?: string;  // For type E (binary choice)
  option_b?: string;  // For type E (binary choice)
  emoji_a?: string;   // For type I (image choice) - visual emoji for option A
  emoji_b?: string;   // For type I (image choice) - visual emoji for option B
  target_player?: 1 | 2;  // For type G (vrai ou faux about a specific player)
  correct_answer?: string;  // For type H (culture générale QCM - the correct option)
  timer: number;
  active: boolean;
}

export type Gender = 'M' | 'F';

export interface Room {
  id: number;
  code: string;
  player1_name: string | null;
  player2_name: string | null;
  player1_gender: Gender | null;
  player2_gender: Gender | null;
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

// Emoji reactions
export const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👏', '🔥', '😍', '🤔'] as const;
export type ReactionEmoji = typeof REACTION_EMOJIS[number];

// Text quick reactions
export const TEXT_REACTIONS = [
  { id: 'ptitcon', text: "P'tit con", emoji: '😏' },
  { id: 'viellepeau', text: 'Vieille peau', emoji: '👵' },
  { id: 'jattends', text: "J'attends", emoji: '⏳' },
  { id: 'comprends', text: 'Je comprends pas', emoji: '🤷' },
  { id: 'allez', text: 'Allez !', emoji: '💪' },
  { id: 'habon', text: 'Ah bon ?', emoji: '🤨' },
] as const;
export type TextReactionId = typeof TEXT_REACTIONS[number]['id'];

export interface ReactionData {
  playerId: 1 | 2;
  emoji: ReactionEmoji;
  timestamp: number;
}

export interface TextReactionData {
  playerId: 1 | 2;
  reactionId: TextReactionId;
  text: string;
  emoji: string;
  timestamp: number;
}

// WebRTC Voice Chat
export interface VoiceOffer {
  sdp: string;
  type: 'offer';
}

export interface VoiceAnswer {
  sdp: string;
  type: 'answer';
}

export interface IceCandidate {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
}

// Socket.IO Events
export interface ServerToClientEvents {
  'room:joined': (data: { room: Room; playerId: 1 | 2 }) => void;
  'room:player-joined': (data: { playerName: string; playerId: 1 | 2; gender: Gender }) => void;
  'room:player-left': (data: { playerId: 1 | 2 }) => void;
  'game:started': (data: { gameId: number }) => void;
  'game:question': (data: { question: Question; questionNumber: number; totalQuestions: number }) => void;
  'game:player-answered': (data: { playerId: 1 | 2 }) => void;
  'game:reveal': (data: GameRevealData) => void;
  'game:score-update': (data: { score1: number; score2: number }) => void;
  'game:finished': (data: GameFinishedData) => void;
  'game:restarted': () => void;
  'game:reaction': (data: ReactionData) => void;
  'game:text-reaction': (data: TextReactionData) => void;
  // Player connection status
  'game:paused': (data: { disconnectedPlayer: 1 | 2; playerName: string }) => void;
  'game:resumed': (data: { reconnectedPlayer: 1 | 2; playerName: string }) => void;
  // Voice chat
  'voice:offer': (data: VoiceOffer) => void;
  'voice:answer': (data: VoiceAnswer) => void;
  'voice:ice-candidate': (data: IceCandidate) => void;
  'voice:peer-toggle': (data: { playerId: 1 | 2; enabled: boolean }) => void;
  'error': (data: { message: string }) => void;
}

// Available question categories
export const QUESTION_CATEGORIES = [
  'couple',
  'sexy',
  'coquin',
  'habitudes',
  'souvenirs',
  'projets',
  'intime',
  'fun',
  'preferences',
  'communication'
] as const;
export type QuestionCategory = typeof QUESTION_CATEGORIES[number];

// Question type configuration for room creation
export const QUESTION_TYPE_CONFIG = [
  { id: 'A', label: 'QCM Partenaire', emoji: '🎯', description: 'Deviner la réponse de ton partenaire' },
  { id: 'B', label: 'QCM Commun', emoji: '🤝', description: 'Répondre ensemble à la même question' },
  { id: 'C', label: 'Texte libre', emoji: '✍️', description: 'Écrire une réponse personnalisée' },
  { id: 'D', label: 'Échelle 1-10', emoji: '📊', description: 'Noter sur une échelle de 1 à 10' },
  { id: 'E', label: 'Choix binaire', emoji: '⚖️', description: 'Choisir entre deux options' },
  { id: 'F', label: 'Qui de nous', emoji: '👫', description: 'Désigner toi, ton partenaire ou les deux' },
  { id: 'G', label: 'Vrai ou Faux', emoji: '✅', description: 'Deviner si c\'est vrai ou faux' },
  { id: 'H', label: 'Culture G.', emoji: '🧠', description: 'Questions de culture générale' },
] as const;

export interface ClientToServerEvents {
  'room:create': (data: { playerName: string; gender: Gender; questionCount?: number; categories?: string[]; questionTypes?: string[] }, callback: (response: RoomResponse) => void) => void;
  'room:join': (data: { code: string; playerName: string; gender: Gender }, callback: (response: RoomResponse) => void) => void;
  'room:leave': () => void;
  'game:start': (callback: (response: { success: boolean; error?: string }) => void) => void;
  'game:answer': (data: { answer: string }) => void;
  'game:restart': (callback: (response: { success: boolean; error?: string }) => void) => void;
  'room:reconnect': (data: { code: string; playerId: 1 | 2 }, callback: (response: RoomResponse) => void) => void;
  'game:reaction': (data: { emoji: ReactionEmoji }) => void;
  'game:text-reaction': (data: { reactionId: TextReactionId }) => void;
  // Voice chat
  'voice:offer': (data: VoiceOffer) => void;
  'voice:answer': (data: VoiceAnswer) => void;
  'voice:ice-candidate': (data: IceCandidate) => void;
  'voice:toggle': (data: { enabled: boolean }) => void;
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
  // Gamification data
  basePoints: number;
  speedBonus1: number;
  speedBonus2: number;
  streakBonus1: number;
  streakBonus2: number;
  streak1: number;
  streak2: number;
  answerTime1: number | null;
  answerTime2: number | null;
  category: string;
  // For Type H (culture générale) - show correct answer
  correctAnswer?: string;
}

export interface QuestionHistory {
  question: Question;
  answer1: string | null;
  answer2: string | null;
  correct: boolean;
  points1: number;
  points2: number;
}

export interface GameFinishedData {
  score1: number;
  score2: number;
  winner: 1 | 2 | 'tie';
  totalQuestions: number;
  correctAnswers1: number;
  correctAnswers2: number;
  // Category breakdown
  categoryScores: CategoryScore[];
  maxStreak1: number;
  maxStreak2: number;
  speedBonusTotal1: number;
  speedBonusTotal2: number;
  perfectMatches: number;
  // Question history for review
  questionHistory?: QuestionHistory[];
}

export interface CategoryScore {
  category: string;
  questionsAnswered: number;
  pointsEarned: number;
  maxPoints: number;
  compatibility: number;
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
