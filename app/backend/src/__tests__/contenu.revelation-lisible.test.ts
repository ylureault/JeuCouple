import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { revealSeconds } from '../services/gameService.js';

/**
 * La révélation doit montrer les DEUX réponses, avant la question suivante.
 *
 * C'est la seule raison d'être de cet écran : un couple joue pour comparer ce
 * que chacun a répondu. En partie réelle sur un téléphone de 667 px, rien de
 * tout cela n'était visible :
 *
 *  - les deux blocs de réponse arrivaient à 718 px, derrière la barre de chat,
 *    parce qu'ils étaient placés APRÈS la bannière de résultat, ses confettis,
 *    son compteur de points et ses badges de bonus ;
 *  - la zone de jeu réservait 64 px sous elle pour une barre qui en fait 112 ;
 *  - un bandeau « PARFAIT ! » plein écran les recouvrait 2,5 s durant ;
 *  - la cérémonie d'ouverture se relançait par-dessus le résultat et poussait
 *    tout vers le bas — l'espace vide signalé en recette.
 *
 * Ces tests lisent la source des deux écrans concernés : ils échouent si l'un
 * de ces quatre défauts revient.
 */

const __dirnameESM = path.dirname(fileURLToPath(import.meta.url));
const lire = (rel: string) =>
  readFileSync(path.join(__dirnameESM, '../../../frontend/src', rel), 'utf-8');

const revealSrc = lire('components/RevealCard.tsx');
const gameSrc = lire('pages/Game.tsx');
const fireworksSrc = lire('components/Fireworks.tsx');

describe('Les deux réponses passent avant le décor', () => {
  it('le bloc de comparaison est placé avant la bannière de résultat', () => {
    const reponses = revealSrc.indexOf('{/* Answers comparison */}');
    const banniere = revealSrc.indexOf('{/* Result banner */}');
    expect(reponses).toBeGreaterThan(-1);
    expect(banniere).toBeGreaterThan(-1);
    expect(reponses).toBeLessThan(banniere);
  });

  it('le bloc de comparaison est placé avant le tableau des scores', () => {
    const reponses = revealSrc.indexOf('{/* Answers comparison */}');
    const scores = revealSrc.indexOf('{/* Kahoot-style Scoreboard */}');
    expect(scores).toBeGreaterThan(-1);
    expect(reponses).toBeLessThan(scores);
  });

  it('le bloc de comparaison suit immédiatement le rappel de la question', () => {
    const rappel = revealSrc.indexOf('{/* Question reminder */}');
    const reponses = revealSrc.indexOf('{/* Answers comparison */}');
    // Seuls le commentaire du bloc et la fermeture du rappel les séparent.
    expect(revealSrc.slice(rappel, reponses)).not.toMatch(/Result banner|Scoreboard|Fake quote/);
  });
});

describe('Rien ne recouvre les réponses', () => {
  it("le bandeau plein écran « PARFAIT ! » n'existe plus", () => {
    // Hors commentaires : le mot a le droit de rester dans l'explication du
    // correctif, pas dans le rendu.
    const sansCommentaires = fireworksSrc
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(sansCommentaires).not.toMatch(/PARFAIT/);
  });

  it("aucun voile centré plein écran ne se superpose au résultat", () => {
    expect(fireworksSrc).not.toMatch(/absolute inset-0 flex items-center justify-center/);
  });

  it('la célébration reste sans interaction et ne capte pas les clics', () => {
    expect(fireworksSrc).toContain('pointer-events-none');
  });
});

describe('La barre du bas ne cache plus le contenu', () => {
  it('la hauteur de la barre est mesurée, pas devinée', () => {
    expect(gameSrc).toContain('ResizeObserver');
    expect(gameSrc).toContain('hauteurBarre');
  });

  it('la zone de jeu réserve cette hauteur sous elle', () => {
    expect(gameSrc).toMatch(/paddingBottom:\s*hauteurBarre/);
  });

  it("la zone de jeu n'utilise plus la marge fixe insuffisante", () => {
    const zone = gameSrc.match(/className="flex-1 flex flex-col[^"]*"/)?.[0] ?? '';
    expect(zone).not.toMatch(/\bpb-16\b/);
  });
});

describe("La cérémonie d'ouverture reste dans la phase de question", () => {
  it("ne s'affiche que pendant la phase de question", () => {
    expect(gameSrc).toMatch(/showIntro && phase === 'question'/);
  });

  it("ne se déclenche plus sur l'identité de l'objet question", () => {
    // Se relancer sur `currentQuestion` remontait la cérémonie par-dessus la
    // révélation, qui reconstruit cet objet.
    const deps = gameSrc.match(/\}, \[currentQuestion[^\]]*\]\);/g) ?? [];
    for (const d of deps) expect(d).not.toMatch(/\[currentQuestion,/);
  });
});

describe('Le temps de lecture est suffisant', () => {
  it('laisse au moins 8 s sur une question à réponses courtes', () => {
    expect(revealSeconds('E')).toBeGreaterThanOrEqual(8);
  });

  it('laisse au moins 15 s sur deux réponses libres à lire', () => {
    expect(revealSeconds('C')).toBeGreaterThanOrEqual(15);
  });

  it('laisse toujours plus de temps sur le texte libre que sur un QCM', () => {
    expect(revealSeconds('C')).toBeGreaterThan(revealSeconds('A'));
  });

  it('reste rapide en Quiz Express, qui vend la vitesse', () => {
    expect(revealSeconds('H', 'quiz_express')).toBeLessThan(revealSeconds('H'));
  });
});
