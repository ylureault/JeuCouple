import { getGameMode } from '../services/gameModes.js';
import { ctx } from './helpers/modeContext.js';

/**
 * Mode classique : la partie s'arrete au bout de la liste, sauf sur la valeur
 * sentinelle historique 50 qui signifie "illimite" et bascule sur une victoire
 * a 200 points d'ecart.
 * Mode duel : boucle sans fin, la main revient au gagnant de la manche.
 */

const classic = getGameMode('classic');
const duel = getGameMode('duel');

describe('Mode classique — liste fixe', () => {
  describe('deroulement d\'une partie de 10 questions', () => {
    // questionIndex est l'index de la manche A VENIR (deja incremente par le moteur).
    for (let index = 1; index <= 9; index++) {
      it(`enchaine sur la question ${index + 1} tant que la liste n'est pas epuisee`, () => {
        const d = classic.afterRound(ctx({ questionIndex: index, loadedQuestions: 10 }));
        expect(d).toEqual({ action: 'next-question' });
      });
    }

    it('termine la partie quand l\'index atteint la fin de la liste', () => {
      expect(classic.afterRound(ctx({ questionIndex: 10, loadedQuestions: 10 })))
        .toEqual({ action: 'finish' });
    });

    it('termine la partie si l\'index depasse la liste', () => {
      expect(classic.afterRound(ctx({ questionIndex: 11, loadedQuestions: 10 })))
        .toEqual({ action: 'finish' });
    });

    it('ne termine pas a l\'avant-derniere question', () => {
      expect(classic.afterRound(ctx({ questionIndex: 9, loadedQuestions: 10 })).action)
        .not.toBe('finish');
    });
  });

  describe('longueurs de partie variees', () => {
    for (const total of [5, 8, 12, 15, 20, 25, 30, 40]) {
      it(`joue exactement ${total} questions puis termine`, () => {
        expect(classic.afterRound(ctx({ questionIndex: total - 1, loadedQuestions: total })).action)
          .toBe('next-question');
        expect(classic.afterRound(ctx({ questionIndex: total, loadedQuestions: total })).action)
          .toBe('finish');
      });
    }

    it('termine immediatement une partie d\'une seule question', () => {
      expect(classic.afterRound(ctx({ questionIndex: 1, loadedQuestions: 1 })).action).toBe('finish');
    });

    it('ne tient pas compte du gagnant de la manche', () => {
      const base = { questionIndex: 3, loadedQuestions: 10 };
      expect(classic.afterRound(ctx({ ...base, roundWinner: 1 })))
        .toEqual(classic.afterRound(ctx({ ...base, roundWinner: 2 })));
    });

    it('ne tient pas compte des scores hors mode illimite', () => {
      const base = { questionIndex: 3, loadedQuestions: 10 };
      expect(classic.afterRound(ctx({ ...base, scores: { player1: 5000, player2: 0 } })))
        .toEqual({ action: 'next-question' });
    });
  });

  describe('sentinelle « illimite » (questionCount = 50)', () => {
    const illimite = (over: Parameters<typeof ctx>[0] = {}) =>
      classic.afterRound(ctx({
        settings: { questionCount: 50, categories: [], questionTypes: [] },
        ...over,
      }));

    for (const ecart of [0, 1, 50, 100, 150, 199]) {
      it(`poursuit la partie tant que l'ecart n'est que de ${ecart} points`, () => {
        expect(illimite({
          questionIndex: 3, loadedQuestions: 10,
          scores: { player1: 300 + ecart, player2: 300 },
        }).action).not.toBe('finish');
      });
    }

    for (const ecart of [200, 201, 350, 1000]) {
      it(`termine la partie des que l'ecart atteint ${ecart} points`, () => {
        expect(illimite({
          questionIndex: 3, loadedQuestions: 10,
          scores: { player1: ecart, player2: 0 },
        })).toEqual({ action: 'finish' });
      });
    }

    it('compte l\'ecart en valeur absolue : le joueur 2 peut aussi gagner', () => {
      expect(illimite({
        questionIndex: 3, loadedQuestions: 10,
        scores: { player1: 0, player2: 250 },
      })).toEqual({ action: 'finish' });
    });

    it('gere des scores negatifs sans terminer par erreur', () => {
      expect(illimite({
        questionIndex: 3, loadedQuestions: 10,
        scores: { player1: -50, player2: -60 },
      }).action).toBe('next-question');
    });

    it('recharge un lot de 20 questions quand le vivier charge est epuise', () => {
      expect(illimite({ questionIndex: 10, loadedQuestions: 10 }))
        .toEqual({ action: 'load-more', count: 20 });
    });

    it('recharge aussi si l\'index depasse largement le vivier', () => {
      expect(illimite({ questionIndex: 42, loadedQuestions: 10 }))
        .toEqual({ action: 'load-more', count: 20 });
    });

    it('n\'a pas besoin de recharger tant qu\'il reste des questions', () => {
      expect(illimite({ questionIndex: 9, loadedQuestions: 10 }))
        .toEqual({ action: 'next-question' });
    });

    it('privilegie la fin de partie sur le rechargement quand l\'ecart est atteint', () => {
      expect(illimite({
        questionIndex: 10, loadedQuestions: 10,
        scores: { player1: 400, player2: 100 },
      })).toEqual({ action: 'finish' });
    });

    it('49 questions demandees ne declenche PAS le mode illimite', () => {
      const d = classic.afterRound(ctx({
        questionIndex: 49, loadedQuestions: 49,
        settings: { questionCount: 49, categories: [], questionTypes: [] },
        scores: { player1: 0, player2: 0 },
      }));
      expect(d).toEqual({ action: 'finish' });
    });

    it('51 questions demandees ne declenche PAS le mode illimite', () => {
      const d = classic.afterRound(ctx({
        questionIndex: 51, loadedQuestions: 51,
        settings: { questionCount: 51, categories: [], questionTypes: [] },
      }));
      expect(d).toEqual({ action: 'finish' });
    });
  });
});

describe('Mode duel — le gagnant impose le theme', () => {
  it('rend la main au joueur 1 quand il remporte la manche', () => {
    expect(duel.afterRound(ctx({ questionIndex: 1, roundWinner: 1 })))
      .toEqual({ action: 'await-theme-choice', chooser: 1 });
  });

  it('rend la main au joueur 2 quand il remporte la manche', () => {
    expect(duel.afterRound(ctx({ questionIndex: 1, roundWinner: 2 })))
      .toEqual({ action: 'await-theme-choice', chooser: 2 });
  });

  describe('egalite parfaite : la main alterne pour ne bloquer personne', () => {
    for (let index = 0; index <= 9; index++) {
      const attendu = index % 2 === 0 ? 1 : 2;
      it(`manche ${index} sans gagnant : la main passe au joueur ${attendu}`, () => {
        expect(duel.afterRound(ctx({ questionIndex: index, roundWinner: null })))
          .toEqual({ action: 'await-theme-choice', chooser: attendu });
      });
    }

    it('deux egalites consecutives ne laissent pas la main au meme joueur', () => {
      const a = duel.afterRound(ctx({ questionIndex: 4, roundWinner: null }));
      const b = duel.afterRound(ctx({ questionIndex: 5, roundWinner: null }));
      expect(a).not.toEqual(b);
    });
  });

  describe('boucle sans fin', () => {
    for (const index of [0, 1, 10, 50, 200, 999]) {
      it(`ne termine jamais la partie, meme a la manche ${index}`, () => {
        expect(duel.afterRound(ctx({ questionIndex: index, roundWinner: 1 })).action)
          .toBe('await-theme-choice');
      });
    }

    it('ne termine pas non plus quand le vivier charge est epuise', () => {
      expect(duel.afterRound(ctx({ questionIndex: 30, loadedQuestions: 1, roundWinner: 2 })).action)
        .toBe('await-theme-choice');
    });

    it('ignore le nombre de questions demande a la creation du salon', () => {
      expect(duel.afterRound(ctx({
        questionIndex: 99, loadedQuestions: 5, roundWinner: 1,
        settings: { questionCount: 5, categories: [], questionTypes: [] },
      })).action).toBe('await-theme-choice');
    });

    it('ignore l\'ecart de score, meme enorme', () => {
      expect(duel.afterRound(ctx({
        questionIndex: 12, roundWinner: 1, scores: { player1: 5000, player2: 0 },
      })).action).toBe('await-theme-choice');
    });
  });

  it('le gagnant prime toujours sur l\'alternance de parite', () => {
    // Manche paire => l'alternance donnerait 1 ; le gagnant 2 doit l'emporter.
    expect(duel.afterRound(ctx({ questionIndex: 4, roundWinner: 2 })))
      .toEqual({ action: 'await-theme-choice', chooser: 2 });
  });
});
