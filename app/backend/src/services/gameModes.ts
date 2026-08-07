/**
 * Registre des modes de jeu.
 *
 * L'objectif est de pouvoir ajouter un nouveau jeu de couple en ecrivant une
 * seule definition ici, sans disperser des `if (mode === '...')` dans la boucle
 * de jeu. Le moteur (gameService) ne connait que cette interface ; chaque mode
 * decide de sa condition de fin, de la facon dont la question suivante est
 * choisie, et de ce qui se passe entre deux manches.
 */
import type { Question } from '../types.js';

/** Etat que le moteur expose aux modes, sans leur donner tout le GameState. */
export interface ModeContext {
  roomCode: string;
  /** Index de la question qui vient d'etre jouee (0-based). */
  questionIndex: number;
  /** Nombre de questions deja chargees dans la partie. */
  loadedQuestions: number;
  scores: { player1: number; player2: number };
  /** Gagnant de la manche qui vient de s'achever, null si egalite parfaite. */
  roundWinner: 1 | 2 | null;
  /**
   * Historique des manches depuis le debut, la plus recente en dernier.
   * Permet a un mode de deriver series et penalites sans etat propre.
   */
  roundWinners: (1 | 2 | null)[];
  /** Pour chaque manche, si les deux joueurs se sont accordes. */
  roundAgreements: boolean[];
  /** Escalade : dernier palier valide par les deux joueurs (0 = premier). */
  acquiredPalier: number;
  /** Reglages choisis a la creation du salon. */
  settings: {
    questionCount: number;
    categories: string[];
    questionTypes: string[];
  };
}

/** Ce que le mode demande au moteur de faire apres une manche. */
export type ModeDecision =
  | { action: 'next-question' }                          // enchainer normalement
  | { action: 'load-more'; count: number }               // recharger puis enchainer
  | { action: 'finish'; reason?: string }                // terminer la partie
  | { action: 'await-theme-choice'; chooser: 1 | 2 }     // rendre la main a un joueur
  | { action: 'next-from-category'; category: string }   // imposer le theme suivant
  | { action: 'next-inverted' }                          // manche a l'envers
  | { action: 'await-palier-consent'; nextCategory: string; stayCategory: string; palier: number };

export interface GameModeDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  /** Si vrai, l'interface n'affiche pas de "question X sur Y". */
  endless: boolean;
  /** Nombre de questions chargees au demarrage. */
  initialQuestionCount(settings: ModeContext['settings']): number;
  /** Decide de la suite apres chaque manche. */
  afterRound(ctx: ModeContext): ModeDecision;
}

const UNLIMITED_QUESTION_COUNT = 50;   // valeur sentinelle historique
const UNLIMITED_GAP_TO_WIN = 200;
const RELOAD_BATCH = 20;

/** Mode historique : liste fixe, la partie se termine au bout. */
const classic: GameModeDefinition = {
  id: 'classic',
  label: 'Partie classique',
  description: 'Un nombre de questions fixe, puis le resultat final.',
  icon: '🎯',
  endless: false,
  initialQuestionCount: (s) => s.questionCount,
  afterRound: (ctx) => {
    // La valeur 50 sert historiquement de sentinelle "illimite" : on garde
    // ce comportement, la partie s'arretant sur un ecart de 200 points.
    if (ctx.settings.questionCount === UNLIMITED_QUESTION_COUNT) {
      const gap = Math.abs(ctx.scores.player1 - ctx.scores.player2);
      if (gap >= UNLIMITED_GAP_TO_WIN) return { action: 'finish' };
      if (ctx.questionIndex >= ctx.loadedQuestions) {
        return { action: 'load-more', count: RELOAD_BATCH };
      }
      return { action: 'next-question' };
    }

    if (ctx.questionIndex >= ctx.loadedQuestions) return { action: 'finish' };
    return { action: 'next-question' };
  },
};

/**
 * Mode duel : boucle sans fin. Celui qui remporte la manche choisit le theme
 * de la question suivante ; en cas d'egalite de points, c'est le plus rapide.
 * Si personne ne se detache, le moteur alterne pour ne jamais bloquer.
 */
const duel: GameModeDefinition = {
  id: 'duel',
  label: 'Duel sans fin',
  description: 'Le gagnant de chaque manche choisit le theme de la suivante. Aucune limite.',
  icon: '⚔️',
  endless: true,
  // On amorce petit : les questions suivantes sont tirees theme par theme.
  initialQuestionCount: () => 1,
  afterRound: (ctx) => {
    // Egalite parfaite : on alterne selon la parite de la manche, ce qui evite
    // qu'un meme joueur garde la main indefiniment.
    const chooser = ctx.roundWinner ?? (((ctx.questionIndex % 2) === 0) ? 1 : 2);
    return { action: 'await-theme-choice', chooser };
  },
};

/**
 * Mode escalade : la temperature monte toute seule.
 * Le moteur impose le theme en suivant une echelle, du plus tendre au plus
 * explicite, et change de palier tous les ESCALADE_PALIER_LEN manches.
 * Mecanique propre : progression pilotee par le jeu, aucun choix des joueurs.
 */
const ESCALADE_LADDER = [
  'couple',          // on commence par se raconter
  'souvenirs',
  'preliminaires',
  'sexy',
  'coquin',
  'fantasmes',
  'extreme',
  'sans_tabou',      // dernier palier
];
// Longueur surchargeable en test (une manche par palier pour verifier le flux).
const ESCALADE_PALIER_LEN = Number(process.env.ESCALADE_PALIER_LEN) || 3;

const escalade: GameModeDefinition = {
  id: 'escalade',
  label: 'Escalade',
  description: 'La temperature monte a chaque palier, du plus tendre au plus explicite.',
  icon: '🌡️',
  endless: false,
  initialQuestionCount: () => 1,
  afterRound: (ctx) => {
    // La montee de palier n'est plus imposee : les DEUX joueurs la valident
    // (constat GRAVE n.4 du coach, arbitre P1-11). Un refus n'arrete pas le
    // jeu : on reste au palier acquis, sans commentaire.
    const nextRound = ctx.questionIndex;             // manche a venir, 0-based
    if (nextRound >= ESCALADE_PALIER_LEN * ESCALADE_LADDER.length) {
      return { action: 'finish', reason: 'Vous avez gravi tous les paliers' };
    }
    const wanted = Math.min(
      Math.floor(nextRound / ESCALADE_PALIER_LEN),
      ESCALADE_LADDER.length - 1
    );
    if (wanted > ctx.acquiredPalier) {
      return {
        action: 'await-palier-consent',
        nextCategory: ESCALADE_LADDER[ctx.acquiredPalier + 1],
        stayCategory: ESCALADE_LADDER[ctx.acquiredPalier],
        palier: ctx.acquiredPalier + 1,
      };
    }
    return { action: 'next-from-category', category: ESCALADE_LADDER[ctx.acquiredPalier] };
  },
};

/**
 * Mode complices : purement cooperatif, il n'y a pas d'adversaire.
 * Le couple construit une serie d'accords consecutifs ; un seul desaccord la
 * remet a zero. Mecanique propre : score partage et rupture de serie.
 */
const COMPLICES_TARGET = 10;   // serie a atteindre pour gagner ensemble

const complices: GameModeDefinition = {
  id: 'complices',
  label: 'Complices',
  description: 'Aucun adversaire : enchainez les accords. Un seul desaccord remet la serie a zero.',
  icon: '🤝',
  endless: true,
  initialQuestionCount: () => 1,
  afterRound: (ctx) => {
    // Longueur de la serie d'accords en cours, en repartant de la fin.
    let streak = 0;
    for (let i = ctx.roundAgreements.length - 1; i >= 0; i--) {
      if (!ctx.roundAgreements[i]) break;
      streak++;
    }
    if (streak >= COMPLICES_TARGET) {
      return { action: 'finish', reason: `Serie de ${streak} accords d'affilee` };
    }
    if (ctx.questionIndex >= ctx.loadedQuestions) {
      return { action: 'load-more', count: 10 };
    }
    return { action: 'next-question' };
  },
};

/**
 * Mode mort subite : chaque manche perdue coute une vie.
 * Trois vies perdues et la partie s'arrete net. Mecanique propre : elimination.
 */
const SUDDEN_DEATH_LIVES = 3;

const suddenDeath: GameModeDefinition = {
  id: 'sudden_death',
  label: 'Mort subite',
  description: `Chaque manche perdue coute une vie. ${SUDDEN_DEATH_LIVES} vies perdues et c'est fini.`,
  icon: '💀',
  endless: true,
  initialQuestionCount: () => 1,
  afterRound: (ctx) => {
    const losses = { 1: 0, 2: 0 };
    for (const w of ctx.roundWinners) {
      if (w === 1) losses[2]++;
      else if (w === 2) losses[1]++;
      // egalite : personne ne perd de vie
    }
    if (losses[1] >= SUDDEN_DEATH_LIVES || losses[2] >= SUDDEN_DEATH_LIVES) {
      return { action: 'finish', reason: 'Plus de vies' };
    }
    if (ctx.questionIndex >= ctx.loadedQuestions) {
      return { action: 'load-more', count: 10 };
    }
    return { action: 'next-question' };
  },
};

/**
 * Mode inverse : on montre la reponse, il faut retrouver la question.
 * Le moteur fabrique la manche a partir d'une vraie question du catalogue :
 * une de ses reponses possibles devient l'enonce, et les propositions sont
 * quatre intitules de questions dont un seul est le bon.
 * Mecanique propre : le sens de lecture du jeu est retourne.
 */
const inverse: GameModeDefinition = {
  id: 'inverse',
  label: 'A l\'envers',
  description: "On vous montre une reponse : retrouvez de quelle question elle vient.",
  icon: '🔄',
  endless: true,
  initialQuestionCount: () => 1,
  afterRound: () => ({ action: 'next-inverted' }),
};

/**
 * Mode envies : sans le moindre point. On glisse a droite (oui) ou a gauche
 * (non) sur des affirmations directes, et on compare. 200 manches maximum,
 * mais on peut s'arreter quand on veut : la partie n'a pas de perdant.
 */
const SWIPE_ROUNDS = 200;

const envies: GameModeDefinition = {
  id: 'envies',
  label: 'Envies express',
  description: "Glissez : oui a droite, non a gauche. Aucun point, on compare juste vos envies.",
  icon: '💫',
  endless: false,
  initialQuestionCount: () => 1,
  afterRound: (ctx) => {
    if (ctx.questionIndex >= SWIPE_ROUNDS) {
      return { action: 'finish', reason: 'Toutes les envies parcourues' };
    }
    return { action: 'next-from-category', category: 'swipe' };
  },
};

/**
 * Mode petits noms : chacun invente un surnom drole pour l'autre a partir
 * d'un contexte impose ("au reveil", "quand il/elle boude"...), revelation
 * simultanee. Sans points : le seul enjeu est de faire rire l'autre.
 */
const PETITS_NOMS_ROUNDS = 15;

const petitsNoms: GameModeDefinition = {
  id: 'petits_noms',
  label: 'Petits noms',
  description: "Inventez le surnom le plus drole pour l'autre. Revelation simultanee, fous rires garantis.",
  icon: '🐻',
  endless: false,
  initialQuestionCount: () => 1,
  afterRound: (ctx) => {
    if (ctx.questionIndex >= PETITS_NOMS_ROUNDS) {
      return { action: 'finish', reason: 'Album de surnoms complet' };
    }
    return { action: 'next-from-category', category: 'petits_noms' };
  },
};

const MODES: Record<string, GameModeDefinition> = {
  [classic.id]: classic,
  [duel.id]: duel,
  [escalade.id]: escalade,
  [complices.id]: complices,
  [suddenDeath.id]: suddenDeath,
  [inverse.id]: inverse,
  [envies.id]: envies,
  [petitsNoms.id]: petitsNoms,
};

export function getGameMode(id: string | undefined): GameModeDefinition {
  return (id && MODES[id]) || classic;
}

export function listGameModes(): GameModeDefinition[] {
  return Object.values(MODES);
}
