import { calculateBasePoints } from '../services/gameService.js';
import type { QuestionType } from '../types.js';

/**
 * Bareme de base du jeu. C'est la fonction qui decide si un couple « se
 * retrouve » sur une question, et combien ca rapporte. Chaque type de saisie a
 * sa propre regle : un accord binaire vaut 100, une echelle est degressive, une
 * question ouverte rapporte un forfait, « Qui de nous deux » connait l'accord
 * partiel. Le reste du moteur (series, bonus de rapidite) s'appuie dessus.
 */

const BASE = 100;

/** Types dont la regle est « meme reponse = 100 points, sinon rien ». */
const TYPES_ACCORD_EXACT: QuestionType[] = ['A', 'B', 'E', 'G', 'I', 'L', 'N', 'O', 'P', 'R', 'S'];

describe('Bareme — accord exact', () => {
  for (const type of TYPES_ACCORD_EXACT) {
    describe(`type ${type}`, () => {
      it('accorde 100 points quand les deux reponses sont identiques', () => {
        expect(calculateBasePoints(type, 'bleu', 'bleu')).toEqual({ basePoints: BASE, correct: true });
      });

      it('ne rapporte rien quand les reponses different', () => {
        expect(calculateBasePoints(type, 'bleu', 'rouge')).toEqual({ basePoints: 0, correct: false });
      });

      it('distingue la casse : ce ne sont pas les memes reponses', () => {
        expect(calculateBasePoints(type, 'Bleu', 'bleu').correct).toBe(false);
      });

      it('ne rapporte rien si le joueur 1 n\'a pas repondu', () => {
        expect(calculateBasePoints(type, undefined, 'bleu')).toEqual({ basePoints: 0, correct: false });
      });

      it('ne rapporte rien si le joueur 2 n\'a pas repondu', () => {
        expect(calculateBasePoints(type, 'bleu', undefined)).toEqual({ basePoints: 0, correct: false });
      });

      it('ne rapporte rien si personne n\'a repondu', () => {
        expect(calculateBasePoints(type, undefined, undefined)).toEqual({ basePoints: 0, correct: false });
      });
    });
  }

  it('ne renvoie jamais de points individuels hors type H', () => {
    const r = calculateBasePoints('A', 'x', 'x');
    expect(r.points1).toBeUndefined();
    expect(r.points2).toBeUndefined();
  });
});

describe('Bareme — type H (culture generale, points individuels)', () => {
  it('donne 100 points a chacun quand les deux ont juste', () => {
    expect(calculateBasePoints('H', 'Paris', 'Paris', 'Paris')).toEqual({
      basePoints: 0, correct: true, points1: BASE, points2: BASE,
    });
  });

  it('ne recompense que le joueur 1 quand lui seul a juste', () => {
    const r = calculateBasePoints('H', 'Paris', 'Lyon', 'Paris');
    expect([r.points1, r.points2]).toEqual([BASE, 0]);
  });

  it('ne recompense que le joueur 2 quand lui seul a juste', () => {
    const r = calculateBasePoints('H', 'Lyon', 'Paris', 'Paris');
    expect([r.points1, r.points2]).toEqual([0, BASE]);
  });

  it('ne donne rien quand les deux se trompent, meme en se trompant pareil', () => {
    const r = calculateBasePoints('H', 'Lyon', 'Lyon', 'Paris');
    expect([r.points1, r.points2, r.correct]).toEqual([0, 0, false]);
  });

  it('marque la manche comme reussie des qu\'au moins un joueur a juste', () => {
    expect(calculateBasePoints('H', 'Paris', 'Lyon', 'Paris').correct).toBe(true);
  });

  it('n\'utilise pas basePoints, reserve aux questions comparees', () => {
    expect(calculateBasePoints('H', 'Paris', 'Paris', 'Paris').basePoints).toBe(0);
  });

  it('ne donne rien au joueur qui n\'a pas repondu', () => {
    const r = calculateBasePoints('H', undefined, 'Paris', 'Paris');
    expect([r.points1, r.points2]).toEqual([0, BASE]);
  });

  it('ne donne rien a personne sans bonne reponse declaree', () => {
    const r = calculateBasePoints('H', 'Paris', 'Paris', undefined);
    expect([r.points1, r.points2, r.correct]).toEqual([0, 0, false]);
  });

  it('exige une correspondance exacte, espaces compris', () => {
    expect(calculateBasePoints('H', 'Paris ', 'Paris', 'Paris').points1).toBe(0);
  });

  it('est sensible a la casse', () => {
    expect(calculateBasePoints('H', 'paris', 'Paris', 'Paris').points1).toBe(0);
  });
});

describe('Bareme — type F « Qui de nous deux »', () => {
  const cas: [string, string, string, number, boolean][] = [
    ['accord sur le joueur 1', 'player1', 'player1', BASE, true],
    ['accord sur le joueur 2', 'player2', 'player2', BASE, true],
    ['accord sur « nous deux »', 'both', 'both', BASE, true],
    ['desaccord franc entre les deux joueurs', 'player1', 'player2', 0, false],
    ['accord partiel : « nous deux » face au joueur 1', 'both', 'player1', 40, true],
    ['accord partiel : le joueur 1 face a « nous deux »', 'player1', 'both', 40, true],
    ['accord partiel : « nous deux » face au joueur 2', 'both', 'player2', 40, true],
    ['accord partiel : le joueur 2 face a « nous deux »', 'player2', 'both', 40, true],
  ];

  for (const [libelle, a1, a2, points, correct] of cas) {
    it(`${libelle} vaut ${points} point(s)`, () => {
      expect(calculateBasePoints('F', a1, a2)).toEqual({ basePoints: points, correct });
    });
  }

  const jeNeSaisPas: [string, string, string][] = [
    ['les deux repondent « je ne sais pas »', 'dontknow', 'dontknow'],
    ['le joueur 1 ne sait pas', 'dontknow', 'player1'],
    ['le joueur 2 ne sait pas', 'player1', 'dontknow'],
    ['« je ne sais pas » face a « nous deux »', 'dontknow', 'both'],
    ['« nous deux » face a « je ne sais pas »', 'both', 'dontknow'],
  ];

  for (const [libelle, a1, a2] of jeNeSaisPas) {
    it(`ne rapporte rien quand ${libelle}`, () => {
      expect(calculateBasePoints('F', a1, a2)).toEqual({ basePoints: 0, correct: false });
    });
  }

  it('l\'accord partiel vaut strictement moins que l\'accord total', () => {
    const partiel = calculateBasePoints('F', 'both', 'player1').basePoints;
    const total = calculateBasePoints('F', 'player1', 'player1').basePoints;
    expect(partiel).toBeLessThan(total);
  });

  it('l\'accord partiel vaut strictement plus que le desaccord', () => {
    expect(calculateBasePoints('F', 'both', 'player1').basePoints)
      .toBeGreaterThan(calculateBasePoints('F', 'player1', 'player2').basePoints);
  });

  it('l\'accord partiel est presente comme un accord, pas comme une erreur', () => {
    expect(calculateBasePoints('F', 'both', 'player2').correct).toBe(true);
  });

  it('ne rapporte rien si un joueur n\'a pas repondu', () => {
    expect(calculateBasePoints('F', undefined, 'both')).toEqual({ basePoints: 0, correct: false });
  });
});

describe('Bareme — type C (question ouverte)', () => {
  it('recompense le fait d\'avoir repondu tous les deux', () => {
    expect(calculateBasePoints('C', 'un souvenir', 'un autre souvenir'))
      .toEqual({ basePoints: 25, correct: true });
  });

  it('accorde le meme forfait quelles que soient les reponses', () => {
    expect(calculateBasePoints('C', 'a', 'b')).toEqual(calculateBasePoints('C', 'texte long', 'x'));
  });

  it('ne compare pas les textes : deux reponses identiques ne valent pas plus', () => {
    expect(calculateBasePoints('C', 'pareil', 'pareil').basePoints)
      .toBe(calculateBasePoints('C', 'pareil', 'different').basePoints);
  });

  it('ne rapporte rien si le joueur 1 s\'est tu', () => {
    expect(calculateBasePoints('C', undefined, 'quelque chose'))
      .toEqual({ basePoints: 0, correct: false });
  });

  it('ne rapporte rien si le joueur 2 s\'est tu', () => {
    expect(calculateBasePoints('C', 'quelque chose', undefined))
      .toEqual({ basePoints: 0, correct: false });
  });

  it('rapporte moins qu\'un accord exact : ce n\'est pas une reussite', () => {
    expect(calculateBasePoints('C', 'a', 'b').basePoints)
      .toBeLessThan(calculateBasePoints('A', 'a', 'a').basePoints);
  });

  it('rapporte plus que zero : une confession partagee vaut mieux que rien', () => {
    expect(calculateBasePoints('C', 'a', 'b').basePoints).toBeGreaterThan(0);
  });
});

describe('Bareme — echelle 1-10 degressive (types D et Q)', () => {
  const ATTENDU: Record<number, number> = { 0: 100, 1: 80, 2: 60, 3: 40, 4: 20, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };

  for (const type of ['D', 'Q'] as QuestionType[]) {
    describe(`type ${type}`, () => {
      for (let ecart = 0; ecart <= 9; ecart++) {
        it(`un ecart de ${ecart} rapporte ${ATTENDU[ecart]} point(s)`, () => {
          expect(calculateBasePoints(type, '1', String(1 + ecart)).basePoints).toBe(ATTENDU[ecart]);
        });
      }

      for (let ecart = 0; ecart <= 2; ecart++) {
        it(`un ecart de ${ecart} est presente comme un accord`, () => {
          expect(calculateBasePoints(type, '5', String(5 + ecart)).correct).toBe(true);
        });
      }

      for (const ecart of [3, 4, 5, 9]) {
        it(`un ecart de ${ecart} n'est plus presente comme un accord`, () => {
          expect(calculateBasePoints(type, '1', String(1 + ecart)).correct).toBe(false);
        });
      }

      it('l\'ecart est symetrique : peu importe qui a note le plus haut', () => {
        expect(calculateBasePoints(type, '9', '6')).toEqual(calculateBasePoints(type, '6', '9'));
      });

      it('un ecart de 3 rapporte encore des points, contrairement a un ecart de 9', () => {
        expect(calculateBasePoints(type, '1', '4').basePoints)
          .toBeGreaterThan(calculateBasePoints(type, '1', '10').basePoints);
      });

      it('le bareme est strictement decroissant sur les cinq premiers ecarts', () => {
        const points = [0, 1, 2, 3, 4].map(e => calculateBasePoints(type, '1', String(1 + e)).basePoints);
        for (let i = 1; i < points.length; i++) {
          expect(points[i]).toBeLessThan(points[i - 1]);
        }
      });

      it('ne rapporte rien sur une note illisible', () => {
        expect(calculateBasePoints(type, 'beaucoup', '5')).toEqual({ basePoints: 0, correct: false });
      });

      it('ne rapporte rien si les deux notes sont illisibles', () => {
        expect(calculateBasePoints(type, 'a', 'b')).toEqual({ basePoints: 0, correct: false });
      });

      it('ne rapporte rien si un joueur n\'a pas note', () => {
        expect(calculateBasePoints(type, undefined, '5')).toEqual({ basePoints: 0, correct: false });
      });

      it('accepte les extremites de l\'echelle', () => {
        expect(calculateBasePoints(type, '1', '10').basePoints).toBe(0);
        expect(calculateBasePoints(type, '10', '10').basePoints).toBe(BASE);
      });
    });
  }
});

describe('Bareme — type J (date exacte)', () => {
  it('accorde 100 points sur le mois exact', () => {
    expect(calculateBasePoints('J', '2019-06', '2019-06')).toEqual({ basePoints: BASE, correct: true });
  });

  it('accorde 50 points quand seule l\'annee coincide', () => {
    expect(calculateBasePoints('J', '2019-06', '2019-11')).toEqual({ basePoints: 50, correct: true });
  });

  it('accorde 50 points meme a onze mois d\'ecart dans la meme annee', () => {
    expect(calculateBasePoints('J', '2019-01', '2019-12').basePoints).toBe(50);
  });

  it('ne rapporte rien quand les annees different', () => {
    expect(calculateBasePoints('J', '2019-06', '2020-06')).toEqual({ basePoints: 0, correct: false });
  });

  it('ne rapporte rien a un mois d\'ecart si l\'annee change', () => {
    expect(calculateBasePoints('J', '2019-12', '2020-01').basePoints).toBe(0);
  });

  it('l\'annee seule vaut strictement moins que le mois exact', () => {
    expect(calculateBasePoints('J', '2019-06', '2019-11').basePoints)
      .toBeLessThan(calculateBasePoints('J', '2019-06', '2019-06').basePoints);
  });

  it('ne rapporte rien si un joueur n\'a pas repondu', () => {
    expect(calculateBasePoints('J', undefined, '2019-06').correct).toBe(false);
  });
});

describe('Bareme — type K (il y a combien de temps)', () => {
  const cas: [number, number, number, boolean][] = [
    [12, 12, BASE, true],
    [12, 13, 75, true],
    [12, 15, 75, true],
    [12, 16, 50, true],
    [12, 18, 50, true],
    [12, 19, 25, true],
    [12, 24, 25, true],
    [12, 25, 0, false],
    [0, 60, 0, false],
  ];

  for (const [a, b, points, correct] of cas) {
    it(`${a} mois face a ${b} mois vaut ${points} point(s)`, () => {
      expect(calculateBasePoints('K', String(a), String(b))).toEqual({ basePoints: points, correct });
    });
  }

  it('est symetrique', () => {
    expect(calculateBasePoints('K', '30', '24')).toEqual(calculateBasePoints('K', '24', '30'));
  });

  it('recompense d\'autant plus que l\'estimation est proche', () => {
    const points = [0, 3, 6, 12, 24].map(d => calculateBasePoints('K', '24', String(24 + d)).basePoints);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeLessThan(points[i - 1]);
    }
  });

  it('ne rapporte rien sur une duree illisible', () => {
    expect(calculateBasePoints('K', 'longtemps', '12')).toEqual({ basePoints: 0, correct: false });
  });
});

describe('Bareme — type M (Top 3)', () => {
  it('accorde 100 points pour un classement identique', () => {
    expect(calculateBasePoints('M', 'a,b,c', 'a,b,c')).toEqual({ basePoints: BASE, correct: true });
  });

  it('accorde 70 points pour deux positions communes', () => {
    expect(calculateBasePoints('M', 'a,b,c', 'a,b,z')).toEqual({ basePoints: 70, correct: true });
  });

  it('accorde 30 points pour une seule position commune', () => {
    expect(calculateBasePoints('M', 'a,b,c', 'a,z,y')).toEqual({ basePoints: 30, correct: true });
  });

  it('ne rapporte rien sans aucune position commune', () => {
    expect(calculateBasePoints('M', 'a,b,c', 'x,y,z')).toEqual({ basePoints: 0, correct: false });
  });

  it('compte la POSITION, pas la simple presence des elements', () => {
    expect(calculateBasePoints('M', 'a,b,c', 'c,b,a').basePoints).toBe(30);
  });

  it('un classement completement inverse sur deux elements ne rapporte rien', () => {
    expect(calculateBasePoints('M', 'a,b', 'b,a')).toEqual({ basePoints: 0, correct: false });
  });

  it('le bareme est croissant avec le nombre de positions communes', () => {
    const p0 = calculateBasePoints('M', 'a,b,c', 'x,y,z').basePoints;
    const p1 = calculateBasePoints('M', 'a,b,c', 'a,y,z').basePoints;
    const p2 = calculateBasePoints('M', 'a,b,c', 'a,b,z').basePoints;
    const p3 = calculateBasePoints('M', 'a,b,c', 'a,b,c').basePoints;
    expect([p0, p1, p2, p3]).toEqual([...[p0, p1, p2, p3]].sort((x, y) => x - y));
    expect(p3).toBeGreaterThan(p0);
  });

  it('gere un classement plus court sans planter', () => {
    expect(calculateBasePoints('M', 'a', 'a')).toEqual({ basePoints: 30, correct: true });
  });

  it('ne rapporte rien si un joueur n\'a pas classe', () => {
    expect(calculateBasePoints('M', undefined, 'a,b,c')).toEqual({ basePoints: 0, correct: false });
  });
});

describe('Bareme — proprietes generales', () => {
  const tousLesTypes: QuestionType[] =
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S'];

  for (const type of tousLesTypes) {
    it(`le type ${type} ne rend jamais de points negatifs`, () => {
      const r = calculateBasePoints(type, 'x', 'y', 'z');
      expect(r.basePoints).toBeGreaterThanOrEqual(0);
      expect(r.points1 ?? 0).toBeGreaterThanOrEqual(0);
      expect(r.points2 ?? 0).toBeGreaterThanOrEqual(0);
    });
  }

  for (const type of tousLesTypes) {
    it(`le type ${type} ne depasse jamais le bareme de base`, () => {
      const r = calculateBasePoints(type, '5', '5', '5');
      expect(r.basePoints).toBeLessThanOrEqual(BASE);
      expect(r.points1 ?? 0).toBeLessThanOrEqual(BASE);
    });
  }

  it('un type inconnu ne rapporte rien plutot que de planter', () => {
    expect(calculateBasePoints('Z' as QuestionType, 'a', 'a')).toEqual({ basePoints: 0, correct: false });
  });

  it('une reponse vide est traitee comme une absence de reponse', () => {
    expect(calculateBasePoints('A', '', '')).toEqual({ basePoints: 0, correct: false });
  });

  it('seul le type H exploite la bonne reponse fournie', () => {
    expect(calculateBasePoints('A', 'x', 'y', 'x')).toEqual({ basePoints: 0, correct: false });
  });
});
