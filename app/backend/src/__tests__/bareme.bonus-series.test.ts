import { calculateSpeedBonus, getStreakMultiplier, revealSeconds } from '../services/gameService.js';
import type { QuestionType } from '../types.js';

/**
 * Bonus de rapidite et multiplicateurs de serie.
 *
 * Le bonus de rapidite est PROPORTIONNEL au temps alloue a la question : des
 * seuils absolus penalisaient les questions courtes (repondre en 6 s a une
 * question de 15 s est rapide, c'est lent sur une question de 35 s).
 */

const DEBUT = 1_000_000;   // horodatage de depart arbitraire
const bonus = (secondes: number, timer: number) =>
  calculateSpeedBonus(DEBUT + secondes * 1000, DEBUT, timer);

describe('Bonus de rapidite — proportionnel au minuteur', () => {
  describe('question de 20 secondes', () => {
    const cas: [number, number][] = [
      [0, 0.25], [1, 0.25], [3, 0.25], [5.9, 0.25], [6, 0.25],
      [6.1, 0.10], [8, 0.10], [11.9, 0.10], [12, 0.10],
      [12.1, 0], [15, 0], [20, 0], [40, 0],
    ];
    for (const [secondes, attendu] of cas) {
      it(`repondre en ${secondes} s vaut ${Math.round(attendu * 100)} % de bonus`, () => {
        expect(bonus(secondes, 20)).toBeCloseTo(attendu, 5);
      });
    }
  });

  describe('question de 10 secondes', () => {
    const cas: [number, number][] = [
      [0, 0.25], [3, 0.25], [3.1, 0.10], [6, 0.10], [6.1, 0], [9, 0],
    ];
    for (const [secondes, attendu] of cas) {
      it(`repondre en ${secondes} s vaut ${Math.round(attendu * 100)} % de bonus`, () => {
        expect(bonus(secondes, 10)).toBeCloseTo(attendu, 5);
      });
    }
  });

  describe('question de 30 secondes', () => {
    const cas: [number, number][] = [
      [5, 0.25], [9, 0.25], [9.1, 0.10], [18, 0.10], [18.1, 0], [25, 0],
    ];
    for (const [secondes, attendu] of cas) {
      it(`repondre en ${secondes} s vaut ${Math.round(attendu * 100)} % de bonus`, () => {
        expect(bonus(secondes, 30)).toBeCloseTo(attendu, 5);
      });
    }
  });

  it('la meme duree n\'est pas jugee pareil selon le minuteur de la question', () => {
    // 6 secondes : rapide sur une question de 20 s, moyen sur une de 15 s.
    expect(bonus(6, 20)).toBe(0.25);
    expect(bonus(6, 15)).toBe(0.10);
  });

  it('6 secondes sur une question de 10 s ne vaut plus rien', () => {
    expect(bonus(6.5, 10)).toBe(0);
  });

  it('le bonus ne croit jamais avec le temps ecoule', () => {
    let precedent = Infinity;
    for (let s = 0; s <= 25; s += 0.5) {
      const b = bonus(s, 20);
      expect(b).toBeLessThanOrEqual(precedent);
      precedent = b;
    }
  });

  it('ne prend que trois valeurs possibles', () => {
    const valeurs = new Set<number>();
    for (let s = 0; s <= 40; s += 0.25) valeurs.add(bonus(s, 20));
    expect([...valeurs].sort((a, b) => a - b)).toEqual([0, 0.10, 0.25]);
  });

  it('n\'est jamais negatif, meme sur une reponse arrivee « avant » le depart', () => {
    expect(bonus(-3, 20)).toBeGreaterThanOrEqual(0);
  });

  describe('garde-fou sans minuteur exploitable', () => {
    for (const timer of [0, -5, NaN]) {
      it(`retombe sur les seuils absolus quand le minuteur vaut ${timer}`, () => {
        expect(bonus(4, timer)).toBe(0.25);
        expect(bonus(7, timer)).toBe(0.10);
        expect(bonus(11, timer)).toBe(0);
      });
    }

    it('la borne haute du palier rapide est 5 secondes', () => {
      expect(bonus(5, 0)).toBe(0.25);
      expect(bonus(5.1, 0)).toBe(0.10);
    });

    it('la borne haute du palier moyen est 10 secondes', () => {
      expect(bonus(10, 0)).toBe(0.10);
      expect(bonus(10.1, 0)).toBe(0);
    });
  });

  describe('proportionnalite verifiee sur plusieurs minuteurs', () => {
    for (const timer of [12, 15, 20, 25, 30, 35]) {
      it(`le palier rapide de la question de ${timer} s tient au tiers du temps`, () => {
        expect(bonus(timer * 0.3, timer)).toBe(0.25);
        expect(bonus(timer * 0.3 + 0.5, timer)).toBe(0.10);
      });

      it(`le palier moyen de la question de ${timer} s tient aux deux tiers du temps`, () => {
        expect(bonus(timer * 0.6, timer)).toBe(0.10);
        expect(bonus(timer * 0.6 + 0.5, timer)).toBe(0);
      });
    }
  });
});

describe('Multiplicateurs de serie', () => {
  const table: [number, number][] = [
    [0, 1], [1, 1], [2, 1.2], [3, 1.5], [4, 1.75], [5, 2], [6, 2], [10, 2], [50, 2],
  ];

  for (const [serie, attendu] of table) {
    it(`une serie de ${serie} donne un multiplicateur de ${attendu}`, () => {
      expect(getStreakMultiplier(serie)).toBe(attendu);
    });
  }

  it('une serie de 0 ou 1 ne donne aucun bonus', () => {
    expect(getStreakMultiplier(0)).toBe(1);
    expect(getStreakMultiplier(1)).toBe(1);
  });

  it('le multiplicateur est croissant jusqu\'au plafond', () => {
    const valeurs = [1, 2, 3, 4, 5].map(getStreakMultiplier);
    for (let i = 1; i < valeurs.length; i++) {
      expect(valeurs[i]).toBeGreaterThan(valeurs[i - 1]);
    }
  });

  it('plafonne a 2 : une serie de 100 ne vaut pas plus qu\'une serie de 5', () => {
    expect(getStreakMultiplier(100)).toBe(getStreakMultiplier(5));
  });

  it('ne descend jamais sous 1, meme sur une valeur aberrante', () => {
    expect(getStreakMultiplier(-3)).toBe(1);
  });

  it('doubler les points demande cinq bonnes manches d\'affilee', () => {
    expect(getStreakMultiplier(4)).toBeLessThan(2);
    expect(getStreakMultiplier(5)).toBe(2);
  });

  it('appliquer le multiplicateur a 100 points donne un bonus entier', () => {
    for (const serie of [2, 3, 4, 5]) {
      const bonusSerie = Math.round(100 * (getStreakMultiplier(serie) - 1));
      expect(Number.isInteger(bonusSerie)).toBe(true);
      expect(bonusSerie).toBeGreaterThan(0);
    }
  });
});

describe('Cadence de la revelation', () => {
  const tousLesTypes: QuestionType[] =
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S'];

  it('laisse 14 secondes pour lire deux reponses libres (type C)', () => {
    expect(revealSeconds('C')).toBe(14);
  });

  for (const type of tousLesTypes.filter(t => t !== 'C')) {
    it(`enchaine en 7 secondes apres une question de type ${type}`, () => {
      expect(revealSeconds(type)).toBe(7);
    });
  }

  it('laisse strictement plus de temps sur le texte libre que sur un QCM', () => {
    expect(revealSeconds('C')).toBeGreaterThan(revealSeconds('A'));
  });

  it('rend toujours une duree strictement positive', () => {
    for (const type of tousLesTypes) {
      expect(revealSeconds(type)).toBeGreaterThan(0);
    }
  });
});
