/**
 * Reglage de table par mode de jeu.
 *
 * Les types de questions sont restreints volontairement pour que chaque session
 * soit deterministe (meme bareme, meme cadence) et pour tenir la duree totale :
 * le type E (choix binaire) revele en 7 s, le type C (reponse libre) en 14 s.
 */
import { GAME_MODES } from '../../../types.js';

export interface ModeCfg {
  id: string;
  /** Libelle attendu cote serveur (registre gameModes.ts). */
  label: string;
  questionTypes: string[];
  categories?: string[];
  questionCount?: number;
  /** Delai attendu entre la revelation et la manche suivante, en secondes. */
  revealSeconds: number;
}

export const MODES: ModeCfg[] = [
  { id: 'classic', label: 'Partie classique', questionTypes: ['E'], questionCount: 8, revealSeconds: 9 },
  { id: 'duel', label: 'Duel sans fin', questionTypes: ['E'], revealSeconds: 9 },
  { id: 'escalade', label: 'Escalade', questionTypes: ['E'], revealSeconds: 9 },
  { id: 'complices', label: 'Complices', questionTypes: ['E'], revealSeconds: 9 },
  { id: 'sudden_death', label: 'Mort subite', questionTypes: ['E'], revealSeconds: 9 },
  // Le mode "a l'envers" fabrique ses manches a partir de questions a options :
  // seuls les types A et B en portent, d'ou la restriction.
  { id: 'inverse', label: "A l'envers", questionTypes: ['A', 'B'], revealSeconds: 9 },
  { id: 'envies', label: 'Envies express', questionTypes: ['S'], revealSeconds: 9 },
  // Les 20 questions "petits noms" sont toutes de type C : revelation a 14 s.
  { id: 'petits_noms', label: 'Petits noms', questionTypes: ['C'], revealSeconds: 16 },
  { id: 'mix', label: 'Mix total', questionTypes: ['E'], revealSeconds: 9 },
  // Le quiz express impose lui-meme son perimetre (culture / type H) et
  // raccourcit la revelation a 4 s : c'est son identite.
  { id: 'quiz_express', label: 'Quiz Express', questionTypes: ['H'], categories: ['culture'], questionCount: 8, revealSeconds: 4 },
];

/**
 * Le mode joue-t-il sans points ?
 *
 * Lu dans le catalogue partage plutot que recopie ici : le bareme, le joker et
 * le podium n'ont aucun sens dans « envies » ou « petits noms », et les
 * scenarios doivent attendre 0 la ou les autres modes attendent 100.
 */
export function estSansPoints(id: string): boolean {
  return GAME_MODES.some((m) => m.id === id && m.scoreless === true);
}

export function cfg(id: string): ModeCfg {
  const m = MODES.find((x) => x.id === id);
  if (!m) throw new Error(`mode inconnu dans la configuration de test : ${id}`);
  return m;
}

/** Prefixe de scenario, pour un rapport lisible mode par mode. */
export function P(m: ModeCfg): string {
  return `[${m.label}]`;
}
