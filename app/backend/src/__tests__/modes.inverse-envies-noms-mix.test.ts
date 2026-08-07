import { getGameMode } from '../services/gameModes.js';
import { ctx, repeat } from './helpers/modeContext.js';

/**
 * Quatre mecaniques restantes :
 *  - inverse     : chaque manche est fabriquee a l'envers, sans fin.
 *  - envies      : 200 glissements maximum, theme impose « swipe », sans points.
 *  - petits_noms : 15 manches, theme impose « petits_noms », sans points.
 *  - mix         : enchainement libre, main rendue une manche sur quatre.
 */

const inverse = getGameMode('inverse');
const envies = getGameMode('envies');
const petitsNoms = getGameMode('petits_noms');
const mix = getGameMode('mix');

describe('Mode « A l\'envers »', () => {
  const contextes: [string, Parameters<typeof ctx>[0]][] = [
    ['au demarrage', { questionIndex: 0 }],
    ['en cours de partie', { questionIndex: 7 }],
    ['tres loin dans la partie', { questionIndex: 500 }],
    ['avec le vivier epuise', { questionIndex: 9, loadedQuestions: 1 }],
    ['avec un gagnant', { questionIndex: 3, roundWinner: 1 }],
    ['sans gagnant', { questionIndex: 3, roundWinner: null }],
    ['avec un ecart de score enorme', { questionIndex: 3, scores: { player1: 9000, player2: 0 } }],
    ['avec une longue serie d\'accords', { questionIndex: 3, roundAgreements: repeat(true, 40) }],
    ['avec un historique de manches perdues', { questionIndex: 3, roundWinners: repeat<1 | 2 | null>(1, 10) }],
    ['avec des themes imposes au salon', { questionIndex: 3, settings: { questionCount: 10, categories: ['culture'], questionTypes: ['H'] } }],
  ];

  for (const [libelle, over] of contextes) {
    it(`fabrique une manche a l'envers ${libelle}`, () => {
      expect(inverse.afterRound(ctx(over))).toEqual({ action: 'next-inverted' });
    });
  }

  it('ne termine jamais la partie', () => {
    for (let i = 0; i < 300; i += 37) {
      expect(inverse.afterRound(ctx({ questionIndex: i })).action).not.toBe('finish');
    }
  });

  it('ne demande jamais de theme aux joueurs', () => {
    expect(inverse.afterRound(ctx({ questionIndex: 4, roundWinner: 2 })).action)
      .not.toBe('await-theme-choice');
  });
});

describe('Mode « Envies express »', () => {
  describe('theme impose', () => {
    for (const manche of [0, 1, 2, 50, 100, 198, 199]) {
      it(`sert une carte du theme « swipe » a la manche ${manche}`, () => {
        expect(envies.afterRound(ctx({ questionIndex: manche })))
          .toEqual({ action: 'next-from-category', category: 'swipe' });
      });
    }

    it('impose « swipe » meme si le salon a choisi d\'autres themes', () => {
      expect(envies.afterRound(ctx({
        questionIndex: 5,
        settings: { questionCount: 10, categories: ['couple', 'fun'], questionTypes: [] },
      }))).toEqual({ action: 'next-from-category', category: 'swipe' });
    });

    it('ne recharge jamais un lot : chaque carte est tiree une par une', () => {
      expect(envies.afterRound(ctx({ questionIndex: 5, loadedQuestions: 1 })).action)
        .toBe('next-from-category');
    });
  });

  describe('fin de parcours', () => {
    it('termine a la 200e manche', () => {
      expect(envies.afterRound(ctx({ questionIndex: 200 })))
        .toEqual({ action: 'finish', reason: 'Toutes les envies parcourues' });
    });

    it('termine aussi au-dela de 200 manches', () => {
      expect(envies.afterRound(ctx({ questionIndex: 350 })).action).toBe('finish');
    });

    it('ne termine pas a la 199e manche', () => {
      expect(envies.afterRound(ctx({ questionIndex: 199 })).action).not.toBe('finish');
    });
  });

  describe('mode sans points', () => {
    it('ignore les scores', () => {
      expect(envies.afterRound(ctx({ questionIndex: 10, scores: { player1: 9999, player2: 0 } })))
        .toEqual({ action: 'next-from-category', category: 'swipe' });
    });

    it('ignore le gagnant de la manche', () => {
      expect(envies.afterRound(ctx({ questionIndex: 10, roundWinner: 1 })))
        .toEqual(envies.afterRound(ctx({ questionIndex: 10, roundWinner: 2 })));
    });

    it('ne rend jamais la main a un joueur pour choisir un theme', () => {
      expect(envies.afterRound(ctx({ questionIndex: 10, roundWinner: 1 })).action)
        .not.toBe('await-theme-choice');
    });
  });
});

describe('Mode « Petits noms »', () => {
  describe('theme impose', () => {
    for (const manche of [0, 1, 5, 13, 14]) {
      it(`sert un contexte de surnom a la manche ${manche}`, () => {
        expect(petitsNoms.afterRound(ctx({ questionIndex: manche })))
          .toEqual({ action: 'next-from-category', category: 'petits_noms' });
      });
    }

    it('impose son theme meme si le salon en a choisi d\'autres', () => {
      expect(petitsNoms.afterRound(ctx({
        questionIndex: 3,
        settings: { questionCount: 10, categories: ['coquin'], questionTypes: ['C'] },
      }))).toEqual({ action: 'next-from-category', category: 'petits_noms' });
    });
  });

  describe('album de quinze surnoms', () => {
    it('termine a la 15e manche', () => {
      expect(petitsNoms.afterRound(ctx({ questionIndex: 15 })))
        .toEqual({ action: 'finish', reason: 'Album de surnoms complet' });
    });

    it('ne termine pas a la 14e manche', () => {
      expect(petitsNoms.afterRound(ctx({ questionIndex: 14 })).action).not.toBe('finish');
    });

    it('termine aussi si l\'index depasse quinze', () => {
      expect(petitsNoms.afterRound(ctx({ questionIndex: 40 })).action).toBe('finish');
    });

    it('joue une partie plus courte que le mode « envies »', () => {
      expect(petitsNoms.afterRound(ctx({ questionIndex: 20 })).action).toBe('finish');
      expect(envies.afterRound(ctx({ questionIndex: 20 })).action).not.toBe('finish');
    });
  });

  it('ignore totalement les scores', () => {
    expect(petitsNoms.afterRound(ctx({ questionIndex: 3, scores: { player1: 800, player2: 0 } })))
      .toEqual({ action: 'next-from-category', category: 'petits_noms' });
  });
});

describe('Mode « Mix total »', () => {
  const PERIODE = 4;   // MIX_DUEL_PERIOD par defaut

  describe('main rendue une manche sur quatre', () => {
    for (const manche of [4, 8, 12, 16, 40]) {
      it(`rend la main au gagnant a la manche ${manche}`, () => {
        expect(mix.afterRound(ctx({ questionIndex: manche, roundWinner: 2 })))
          .toEqual({ action: 'await-theme-choice', chooser: 2 });
      });
    }

    for (const manche of [1, 2, 3, 5, 6, 7, 9, 10, 11]) {
      it(`n'interrompt pas le rythme a la manche ${manche}`, () => {
        expect(mix.afterRound(ctx({ questionIndex: manche, loadedQuestions: 50, roundWinner: 1 })))
          .toEqual({ action: 'next-question' });
      });
    }

    it('ne rend pas la main a la manche zero, meme si elle est multiple de quatre', () => {
      expect(mix.afterRound(ctx({ questionIndex: 0, loadedQuestions: 50, roundWinner: 1 })).action)
        .toBe('next-question');
    });

    it('alterne la main quand la manche est nulle', () => {
      // Les manches rendues sont paires : l'alternance designe le joueur 1.
      expect(mix.afterRound(ctx({ questionIndex: PERIODE, roundWinner: null })))
        .toEqual({ action: 'await-theme-choice', chooser: 1 });
    });

    it('le gagnant prime sur l\'alternance', () => {
      expect(mix.afterRound(ctx({ questionIndex: PERIODE, roundWinner: 2 })))
        .toEqual({ action: 'await-theme-choice', chooser: 2 });
    });

    it('le choix de theme prime sur le rechargement du vivier', () => {
      expect(mix.afterRound(ctx({ questionIndex: 8, loadedQuestions: 8, roundWinner: 1 })).action)
        .toBe('await-theme-choice');
    });
  });

  describe('alimentation du vivier', () => {
    it('recharge six questions quand le vivier est epuise', () => {
      expect(mix.afterRound(ctx({ questionIndex: 5, loadedQuestions: 5 })))
        .toEqual({ action: 'load-more', count: 6 });
    });

    it('enchaine tant qu\'il reste des questions chargees', () => {
      expect(mix.afterRound(ctx({ questionIndex: 5, loadedQuestions: 6 })))
        .toEqual({ action: 'next-question' });
    });

    it('recharge par petits lots, contrairement au classique illimite', () => {
      const d = mix.afterRound(ctx({ questionIndex: 7, loadedQuestions: 7 }));
      expect(d.action === 'load-more' && d.count).toBe(6);
    });
  });

  describe('boucle sans fin', () => {
    for (const manche of [1, 5, 9, 100, 401]) {
      it(`ne termine jamais la partie, meme a la manche ${manche}`, () => {
        expect(mix.afterRound(ctx({ questionIndex: manche, loadedQuestions: 500 })).action)
          .not.toBe('finish');
      });
    }

    it('ignore le nombre de questions demande a la creation du salon', () => {
      expect(mix.afterRound(ctx({
        questionIndex: 9, loadedQuestions: 50,
        settings: { questionCount: 5, categories: [], questionTypes: [] },
      })).action).toBe('next-question');
    });

    it('ignore l\'ecart de score', () => {
      expect(mix.afterRound(ctx({
        questionIndex: 9, loadedQuestions: 50, scores: { player1: 4000, player2: 0 },
      })).action).toBe('next-question');
    });
  });
});
