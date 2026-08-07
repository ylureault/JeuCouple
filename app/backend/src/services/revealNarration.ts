/**
 * Narration de la revelation : verdict, commentaire et fausse citation.
 *
 * Pourquoi ce fichier existe (recette utilisateur, points E1 a E3) :
 *
 *  - E1 : l'ecran de resultat tirait l'emoji, la couleur, le titre et le
 *    commentaire INDEPENDAMMENT. On lisait "Vous pensez pareil !" sur un fond
 *    rouge avec un coeur brise et un commentaire de desaccord. Le verdict est
 *    desormais calcule UNE fois, ici, et tout le reste en decoule.
 *  - E2 : "personne n'a repondu" etait compte comme un accord. C'est un
 *    troisieme etat, sans verdict ni celebration.
 *  - E3 : commentaire et citation etaient tires cote client. Deux navigateurs,
 *    deux tirages : un joueur lisait Napoleon, l'autre Einstein, sur la meme
 *    manche. Le moment partage etait detruit. Le tirage se fait donc ici, une
 *    seule fois, et part dans le payload de revelation.
 */
import type { RevealOutcome, RevealQuote } from '../types.js';

const MATCH_COMMENTS = [
  "Vous êtes sur la même longueur d'onde ! 🌊",
  'Télépathie de couple activée ! 🔮',
  "C'est beau l'amour ! 💕",
  'Incroyable synchronisation ! ⚡',
  'Vous vous connaissez par cœur ! 💖',
  'Match parfait ! Comme au premier jour ! 🎯',
  'Les esprits se rencontrent ! 🧠💕🧠',
];

const NO_MATCH_COMMENTS = [
  "Oups... Faut qu'on parle ! 😅",
  "C'est l'occasion de mieux se découvrir ! 💬",
  "Pas grave, l'important c'est de communiquer ! 🗣️",
  'Au moins vous apprenez quelque chose ! 📚',
  'La vie serait ennuyeuse si on pensait pareil ! 🤷',
  "C'est ça qui rend le couple intéressant ! ✨",
];

/**
 * Personne n'a repondu : ni felicitations, ni reproche. On constate, et on
 * propose de reprendre. Aucune de ces phrases ne parle d'accord.
 */
const NO_ANSWER_COMMENTS = [
  'Personne n\'a répondu — on enchaîne, sans drame.',
  'Manche blanche : le temps est passé trop vite.',
  'Aucune réponse cette fois. La prochaine est pour vous.',
];

const QUOTES: RevealQuote[] = [
  { author: 'Albert Einstein', text: "L'amour, c'est comme les maths... Ça ne s'explique pas." },
  { author: 'Confucius', text: 'Celui qui ne connaît pas son partenaire finit par dormir sur le canapé.' },
  { author: 'Socrate', text: 'Je sais que je ne sais rien... surtout sur ma femme.' },
  { author: 'Napoléon', text: "En amour comme à la guerre, il faut savoir battre en retraite." },
  { author: 'Cléopâtre', text: 'Un couple qui joue ensemble reste ensemble.' },
  { author: 'Shakespeare', text: "Être ou ne pas être d'accord, telle est la question du couple." },
  { author: 'Marie Curie', text: "La radioactivité dans un couple, c'est la passion !" },
  { author: 'De Vinci', text: "L'art de l'amour se pratique à deux pinceaux." },
];

/** Sorties qui ne sont pas une reponse a la question posee. */
const NON_REPONSES = new Set(['passer', 'joker', 'dontknow']);

/** Ce joueur a-t-il reellement repondu ? */
function aRepondu(answer: string | undefined): boolean {
  return answer !== undefined && !NON_REPONSES.has(answer);
}

/**
 * Verdict de la manche.
 *
 * L'ordre compte : l'absence de reponse est examinee AVANT l'accord. Sinon
 * `undefined === undefined` vaut "meme reponse" et le jeu felicite deux joueurs
 * qui n'ont rien joue (E2). Meme raisonnement pour deux "passer" ou deux
 * jokers : personne n'a repondu a la question, il n'y a donc rien a celebrer.
 */
export function computeOutcome(
  answer1: string | undefined,
  answer2: string | undefined,
  correct: boolean
): RevealOutcome {
  if (!aRepondu(answer1) && !aRepondu(answer2)) return 'no-answer';
  return correct || (answer1 !== undefined && answer1 === answer2) ? 'match' : 'no-match';
}

/** Commentaire d'animateur accorde au verdict, tire une seule fois. */
export function pickComment(
  outcome: RevealOutcome,
  streak: number,
  player1Name: string,
  player2Name: string
): string {
  if (outcome === 'no-answer') return pick(NO_ANSWER_COMMENTS);
  if (outcome === 'match' && streak >= 3) {
    return `🔥 ${player1Name} et ${player2Name} sont EN FEU ! Série de ${streak} !`;
  }
  return pick(outcome === 'match' ? MATCH_COMMENTS : NO_MATCH_COMMENTS);
}

export function pickQuote(): RevealQuote {
  return pick(QUOTES);
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
