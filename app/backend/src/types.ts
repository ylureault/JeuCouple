// Types partagés entre frontend et backend

// Extended question types
// A-I: existing types
// J: Date exacte (deviner une date/mois d'un souvenir)
// K: Durée (il y a combien de temps?)
// L: Avant/Après (ordre chronologique de 2 événements)
// M: Top 3 (classer 3 éléments dans l'ordre de préférence)
// N: Plus/Moins (ce chiffre est-il plus ou moins que X?)
// O: Scénario (que ferais-tu si - hypothétique)
// P: Superpouvoir (quel superpouvoir choisirait ton partenaire?)
// Q: Humeur (deviner l'humeur de l'autre sur une échelle)
// R: Pet Peeves (qu'est-ce qui agace ton partenaire?)
// S: Hot Take (opinion controversée - d'accord ou pas)
export type QuestionType = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S';

// Scoring modes for question types
// 'individual' for Type H: each player scores independently based on correct answer
// 'ranking' for Type M: partial points based on how many items match positions
export type ScoringMode = 'match' | 'consensus' | 'proximity' | 'none' | 'individual' | 'ranking';

// Input types for questions
// 'qcm' for Type H: multiple choice with one correct answer
// 'image_choice' for Type I: visual emoji-based choice between two options
// 'month_select' for Type J: select a month/year
// 'duration' for Type K: select a duration (months/years ago)
// 'ranking' for Type M: order 3 items
// 'plus_moins' for Type N: plus or moins choice
// 'agree_disagree' for Type S: d'accord or pas d'accord
export type InputType = 'options' | 'binary' | 'scale' | 'text' | 'who' | 'qcm' | 'image_choice' | 'month_select' | 'duration' | 'ranking' | 'plus_moins' | 'agree_disagree';

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
  // New fields for types J-S
  ranking_items?: string[];  // For type M (Top 3) - items to rank
  reference_value?: number;  // For type N (Plus/Moins) - the reference number
  scenario_context?: string;  // For type O (Scénario) - additional context
  hot_take_statement?: string;  // For type S (Hot Take) - the controversial statement
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
  player1_avatar?: string;  // Base64 or URL
  player2_avatar?: string;
  player1_theme?: ThemeColor;
  player2_theme?: ThemeColor;
  status: 'waiting' | 'playing' | 'finished';
  created_at: string;
  last_activity: string;
}

// Theme colors available
export const THEME_COLORS = [
  { id: 'purple', name: 'Violet', primary: '#46178f', secondary: '#6b3fa0' },
  { id: 'pink', name: 'Rose', primary: '#e91e63', secondary: '#f06292' },
  { id: 'blue', name: 'Bleu', primary: '#2196f3', secondary: '#64b5f6' },
  { id: 'green', name: 'Vert', primary: '#4caf50', secondary: '#81c784' },
  { id: 'orange', name: 'Orange', primary: '#ff9800', secondary: '#ffb74d' },
  { id: 'red', name: 'Rouge', primary: '#f44336', secondary: '#e57373' },
  { id: 'teal', name: 'Turquoise', primary: '#009688', secondary: '#4db6ac' },
  { id: 'indigo', name: 'Indigo', primary: '#3f51b5', secondary: '#7986cb' },
] as const;
export type ThemeColor = typeof THEME_COLORS[number]['id'];

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
export const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👏', '🔥', '😍', '🤔', '💋', '🤗'] as const;
export type ReactionEmoji = typeof REACTION_EMOJIS[number];

// Text quick reactions
// Remplacees par un vrai chat (GameChat) : les formules toutes faites du type
// "P'tit con" / "Vieille peau" partaient vite en pique entre partenaires.
// Le catalogue est conserve, reduit a des encouragements, car le serveur
// valide encore ces identifiants pour les anciens clients connectes.
export const TEXT_REACTIONS = [
  { id: 'jattends', text: "J'attends", emoji: '⏳' },
  { id: 'allez', text: 'Allez !', emoji: '💪' },
  { id: 'jetaime', text: "Je t'aime", emoji: '❤️' },
  { id: 'bisou', text: 'Bisou !', emoji: '💋' },
  { id: 'bravo', text: 'Bravo !', emoji: '👏' },
  { id: 'parfait', text: 'Parfait !', emoji: '✨' },
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

// Sound reactions (klaxon, applause, etc.)
export const SOUND_REACTIONS = [
  { id: 'klaxon', label: 'Klaxon', emoji: '📯', sound: 'klaxon' },
  { id: 'applause', label: 'Applaudissements', emoji: '👏', sound: 'applause' },
  { id: 'kiss', label: 'Bisou', emoji: '💋', sound: 'kiss' },
  { id: 'laugh', label: 'Rire', emoji: '😂', sound: 'laugh' },
] as const;
export type SoundReactionId = typeof SOUND_REACTIONS[number]['id'];

export interface SoundReactionData {
  playerId: 1 | 2;
  reactionId: SoundReactionId;
  timestamp: number;
}

// Quick predefined messages
export const QUICK_MESSAGES = [
  { id: 'serious', text: "T'es sérieux(se) ?!", emoji: '😳' },
  { id: 'obvious', text: "C'est évident !", emoji: '🙄' },
  { id: 'nooo', text: "Noooon !", emoji: '😱' },
  { id: 'yesss', text: "Ouiii !", emoji: '🎉' },
  { id: 'think', text: "Réfléchis bien...", emoji: '🤔' },
  { id: 'hurry', text: "Dépêche-toi !", emoji: '⏰' },
  { id: 'easy', text: "Trop facile", emoji: '😎' },
  { id: 'hard', text: "C'est dur...", emoji: '😅' },
] as const;
export type QuickMessageId = typeof QUICK_MESSAGES[number]['id'];

export interface QuickMessageData {
  playerId: 1 | 2;
  messageId: QuickMessageId;
  text: string;
  emoji: string;
  timestamp: number;
}

// Buzz/vibration data
export interface BuzzData {
  fromPlayerId: 1 | 2;
  timestamp: number;
}

// Hesitation indicator (player is thinking)
export interface HesitationData {
  playerId: 1 | 2;
  isHesitating: boolean;
}

// Kiss counter
export interface KissData {
  fromPlayerId: 1 | 2;
  totalKisses: number;
  timestamp: number;
}

// Chat messages for lobby
export interface ChatMessage {
  id: string;
  playerId: 1 | 2;
  playerName: string;
  message: string;
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
  // P0-5 : recap des reglages + accord explicite du joueur 2
  'room:settings': (data: RoomSettingsInfo) => void;
  'room:settings-accepted': (data: { playerId: 1 | 2 }) => void;
  'game:started': (data: { gameId: number; gameMode?: GameMode }) => void;
  'game:question': (data: { question: Question; questionNumber: number; totalQuestions: number }) => void;
  'game:player-answered': (data: { playerId: 1 | 2 }) => void;
  'game:reveal': (data: GameRevealData) => void;
  'game:score-update': (data: { score1: number; score2: number }) => void;
  'game:finished': (data: GameFinishedData) => void;
  'game:restarted': () => void;
  'game:reaction': (data: ReactionData) => void;
  'game:text-reaction': (data: TextReactionData) => void;
  'game:sound-reaction': (data: SoundReactionData) => void;
  'game:quick-message': (data: QuickMessageData) => void;
  'game:buzz': (data: BuzzData) => void;
  'game:hesitation': (data: HesitationData) => void;
  'game:kiss': (data: KissData) => void;
  'game:time-bonus': (data: { playerId: 1 | 2; bonusSeconds: number }) => void;
  // Lobby chat
  'lobby:chat': (data: ChatMessage) => void;
  // Player connection status
  'game:paused': (data: { disconnectedPlayer: 1 | 2; playerName: string }) => void;
  'game:resumed': (data: { reconnectedPlayer: 1 | 2; playerName: string }) => void;
  // Escalade : montee de palier proposee aux DEUX joueurs
  'escalade:palier': (data: { palier: number; category: { code: string; name: string; icon: string }; timeoutSeconds: number }) => void;
  'escalade:palier-result': (data: { accepted: boolean }) => void;
  // Mode duel : le gagnant de la manche choisit le theme suivant
  'duel:choose-theme': (data: ThemeChoiceRequest) => void;      // -> au gagnant
  'duel:awaiting-theme': (data: ThemeChoiceWaiting) => void;    // -> a l'autre joueur
  'duel:theme-selected': (data: { category: string; name: string; icon: string; chooserPlayerId: 1 | 2; autoPicked: boolean }) => void;
  // Changement de mode en cours de partie
  'mode:proposal': (data: ModeProposal) => void;                                   // -> au partenaire
  'mode:changed': (data: { mode: GameMode; label: string; icon: string }) => void; // -> aux deux
  'mode:declined': (data: { byName: string }) => void;                             // -> au proposant
  // Voice chat
  'voice:offer': (data: VoiceOffer) => void;
  'voice:answer': (data: VoiceAnswer) => void;
  'voice:ice-candidate': (data: IceCandidate) => void;
  'voice:peer-toggle': (data: { playerId: 1 | 2; enabled: boolean }) => void;
  // Talkie-walkie : le partenaire appuie pour parler / relache
  'voice:peer-ptt': (data: { playerId: 1 | 2; speaking: boolean }) => void;
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
  { id: 'J', label: 'Date exacte', emoji: '📅', description: 'Deviner la date d\'un souvenir' },
  { id: 'K', label: 'Il y a combien?', emoji: '⏰', description: 'Estimer le temps écoulé' },
  { id: 'L', label: 'Avant/Après', emoji: '↔️', description: 'Ordre chronologique de 2 événements' },
  { id: 'M', label: 'Top 3', emoji: '🏆', description: 'Classer 3 éléments par préférence' },
  { id: 'N', label: 'Plus ou Moins', emoji: '🔢', description: 'Deviner si c\'est plus ou moins' },
  { id: 'O', label: 'Scénario', emoji: '🎭', description: 'Que ferait ton partenaire si...' },
  { id: 'P', label: 'Superpouvoir', emoji: '🦸', description: 'Quel pouvoir choisirait-il/elle?' },
  { id: 'Q', label: 'Humeur', emoji: '😊', description: 'Deviner l\'humeur de l\'autre' },
  { id: 'R', label: 'Pet Peeves', emoji: '😤', description: 'Ce qui agace ton partenaire' },
  { id: 'S', label: 'Hot Take', emoji: '🔥', description: 'Opinion controversée à deviner' },
] as const;

export interface ClientToServerEvents {
  'room:create': (data: { playerName: string; gender: Gender; questionCount?: number; categories?: string[]; questionTypes?: string[]; gameMode?: GameMode }, callback: (response: RoomResponse) => void) => void;
  'room:join': (data: { code: string; playerName: string; gender: Gender }, callback: (response: RoomResponse) => void) => void;
  'room:leave': () => void;
  // P0-5 : le joueur 2 accepte les reglages choisis par l'hote
  'room:accept-settings': () => void;
  'game:start': (callback: (response: { success: boolean; error?: string }) => void) => void;
  'game:answer': (data: { answer: string }, callback?: (response: { accepted: boolean; error?: string }) => void) => void;
  'game:restart': (callback: (response: { success: boolean; error?: string }) => void) => void;
  'game:request-pause': (callback: (response: { success: boolean; paused?: boolean }) => void) => void;
  // Mode duel : theme choisi par le gagnant de la manche
  'duel:choose-theme': (data: { category: string }) => void;
  'escalade:palier-respond': (data: { accept: boolean }) => void;
  // Changement de mode en cours de partie
  'mode:propose': (data: { mode: GameMode }) => void;
  'mode:respond': (data: { accept: boolean }) => void;
  'room:reconnect': (data: { code: string; playerId: 1 | 2; sessionToken?: string }, callback: (response: RoomResponse) => void) => void;
  'game:reaction': (data: { emoji: ReactionEmoji }) => void;
  'game:text-reaction': (data: { reactionId: TextReactionId }) => void;
  'game:sound-reaction': (data: { reactionId: SoundReactionId }) => void;
  'game:quick-message': (data: { messageId: QuickMessageId }) => void;
  'game:buzz': () => void;
  'game:hesitation': (data: { isHesitating: boolean }) => void;
  'game:kiss': () => void;
  // Lobby chat
  'lobby:chat': (data: { message: string }) => void;
  // Voice chat
  'voice:offer': (data: VoiceOffer) => void;
  'voice:answer': (data: VoiceAnswer) => void;
  'voice:ice-candidate': (data: IceCandidate) => void;
  'voice:toggle': (data: { enabled: boolean }) => void;
  // Talkie-walkie : j'appuie pour parler / je relache
  'voice:ptt': (data: { speaking: boolean }) => void;
}

// Modes de jeu.
// 'classic' : liste de questions fixee au demarrage, la partie se termine.
// 'duel'    : boucle sans fin. A chaque manche, le gagnant (ou le plus rapide
//             en cas d'egalite) choisit le theme de la question suivante.
export type GameMode = 'mix' | 'classic' | 'duel' | 'escalade' | 'complices' | 'sudden_death' | 'inverse' | 'envies' | 'petits_noms' | 'quiz_express';

// Catalogue affiche au joueur. Doit rester aligne avec le registre serveur
// (backend/src/services/gameModes.ts), qui reste la source de verite des regles.
export const GAME_MODES: {
  id: GameMode;
  label: string;
  tagline: string;
  description: string;
  icon: string;
  endless: boolean;
  /** Mode sans points : podium, joker et bonus n'y ont aucun sens. */
  scoreless?: boolean;
}[] = [
  {
    id: 'mix',
    label: 'Mix total',
    tagline: 'Tout peut arriver',
    description: "Toutes les questions de tous les thèmes, mélangées. Une manche sur quatre, le gagnant de la manche choisit le thème suivant.",
    icon: '🎲',
    endless: true,
  },
  {
    id: 'classic',
    label: 'Classique',
    tagline: 'La partie de référence',
    description: 'Un nombre de questions fixe, puis votre score de compatibilité.',
    icon: '🎯',
    endless: false,
  },
  {
    id: 'duel',
    label: 'Duel sans fin',
    tagline: 'Le gagnant impose le thème',
    description: "Celui qui remporte la manche choisit le thème de la suivante. À égalité, c'est le plus rapide. Aucune limite.",
    icon: '⚔️',
    endless: true,
  },
  {
    id: 'escalade',
    label: 'Escalade',
    tagline: 'La température monte',
    description: 'Le jeu impose les thèmes et grimpe palier par palier, du plus tendre au plus explicite.',
    icon: '🌡️',
    endless: false,
  },
  {
    id: 'complices',
    label: 'Complices',
    tagline: 'Vous contre le jeu',
    description: "Aucun adversaire : enchaînez les accords. Un seul désaccord remet la série à zéro.",
    icon: '🤝',
    endless: true,
  },
  {
    id: 'inverse',
    label: "À l'envers",
    tagline: 'La réponse avant la question',
    description: "On vous montre une réponse : retrouvez de quelle question elle vient.",
    icon: '🔄',
    endless: true,
  },
  {
    id: 'envies',
    scoreless: true,
    label: 'Envies express',
    tagline: 'Oui ou non, sans points',
    description: "Glissez : oui à droite, non à gauche. Aucun point, on compare juste vos envies.",
    icon: '💫',
    endless: false,
  },
  {
    id: 'petits_noms',
    scoreless: true,
    label: 'Petits noms',
    tagline: 'Fous rires garantis',
    description: "Inventez le surnom le plus drôle pour l'autre. Révélation simultanée.",
    icon: '🐻',
    endless: false,
  },
  {
    id: 'sudden_death',
    label: 'Mort subite',
    tagline: 'Trois vies chacun',
    description: "Chaque manche perdue coûte une vie. Trois vies perdues et la partie s'arrête net.",
    icon: '💀',
    endless: true,
  },
  {
    // Seul mode ou l'on ne se compare pas : les QCM ont une bonne reponse, donc
    // chacun marque ses propres points. Le theme est impose (culture generale),
    // le selecteur de themes n'a donc aucun effet ici.
    id: 'quiz_express',
    label: 'Quiz Express',
    tagline: 'Culture G, à toute vitesse',
    description: "Que des QCM de culture générale, sur un rythme serré. Chacun marque ses propres points : ici, on joue l'un contre l'autre.",
    icon: '🧠',
    endless: false,
  },
];

// Theme propose au gagnant d'une manche en mode duel.
export interface ThemeChoiceOption {
  code: string;
  name: string;
  icon: string;
  color: string;
  questionCount: number;
}

export interface ThemeChoiceRequest {
  options: ThemeChoiceOption[];
  timeoutSeconds: number;   // au-dela, le serveur tire un theme au hasard
  roundNumber: number;
}

// Changement de mode en cours de partie : un joueur propose, l'autre valide.
export interface ModeProposal {
  mode: GameMode;
  label: string;
  icon: string;
  fromPlayerId: 1 | 2;
  fromName: string;
  timeoutSeconds: number;
}

export interface ThemeChoiceWaiting {
  chooserPlayerId: 1 | 2;
  chooserName: string;
  reason: 'winner' | 'faster' | 'tiebreak';
  timeoutSeconds: number;
}

// Recap des reglages du salon, montre aux deux joueurs au lobby (P0-5 :
// le joueur 2 doit savoir a quoi il va jouer AVANT le lancement).
export interface RoomSettingsInfo {
  gameMode: string;
  modeLabel: string;
  modeIcon: string;
  endless: boolean;
  questionCount: number;
  /** Vide = tous les themes (mode auto). */
  categories: { code: string; name: string; icon: string }[];
  settingsAccepted: boolean;
}

export interface RoomResponse {
  success: boolean;
  room?: Room;
  playerId?: 1 | 2;
  /** Jeton secret remis au create/join, exige au room:reconnect.
      C'est lui qui authentifie le joueur, pas le code de salon. */
  sessionToken?: string;
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
  /** Cadence : duree exacte avant la question suivante (7 s en binaire/QCM,
      14 s pour lire deux reponses libres). Le decompte client s'y cale. */
  nextInSeconds?: number;
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
