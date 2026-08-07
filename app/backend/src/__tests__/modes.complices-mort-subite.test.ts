import { getGameMode } from '../services/gameModes.js';
import { ctx, repeat } from './helpers/modeContext.js';

/**
 * Complices : cooperatif pur. Le couple construit une serie d'accords ; un seul
 * desaccord la remet a zero, dix accords d'affilee terminent la partie.
 * Mort subite : chaque manche perdue coute une vie, trois vies perdues et c'est
 * fini. Une egalite ne coute de vie a personne.
 */

const complices = getGameMode('complices');
const mortSubite = getGameMode('sudden_death');

describe('Mode complices — serie d\'accords', () => {
  describe('longueur de serie', () => {
    for (let n = 0; n <= 9; n++) {
      it(`ne termine pas la partie avec ${n} accord(s) d'affilee`, () => {
        expect(complices.afterRound(ctx({
          questionIndex: 1, loadedQuestions: 10, roundAgreements: repeat(true, n),
        })).action).not.toBe('finish');
      });
    }

    it('termine la partie au dixieme accord consecutif', () => {
      expect(complices.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundAgreements: repeat(true, 10),
      }))).toEqual({ action: 'finish', reason: "Serie de 10 accords d'affilee" });
    });

    it('annonce la longueur reelle de la serie dans la raison', () => {
      const d = complices.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundAgreements: repeat(true, 13),
      }));
      expect(d.action === 'finish' && d.reason).toBe("Serie de 13 accords d'affilee");
    });
  });

  describe('rupture de serie', () => {
    it('un seul desaccord remet la serie a zero', () => {
      // Dix accords puis un desaccord : la serie courante vaut 0.
      expect(complices.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10,
        roundAgreements: [...repeat(true, 10), false],
      })).action).not.toBe('finish');
    });

    it('ne compte que la serie EN COURS, pas le total des accords', () => {
      const agreements = [true, true, true, false, true, true, false, true, true, true];
      expect(complices.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundAgreements: agreements,
      })).action).not.toBe('finish');
    });

    it('repart de zero apres une coupure et peut regagner ensuite', () => {
      expect(complices.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10,
        roundAgreements: [false, ...repeat(true, 10)],
      })).action).toBe('finish');
    });

    it('une serie coupee au milieu ne s\'additionne pas', () => {
      expect(complices.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10,
        roundAgreements: [...repeat(true, 6), false, ...repeat(true, 6)],
      })).action).not.toBe('finish');
    });

    it('un historique de desaccords seuls ne termine jamais', () => {
      expect(complices.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundAgreements: repeat(false, 30),
      })).action).not.toBe('finish');
    });
  });

  describe('alimentation du vivier', () => {
    it('recharge dix questions quand le vivier charge est epuise', () => {
      expect(complices.afterRound(ctx({
        questionIndex: 5, loadedQuestions: 5, roundAgreements: repeat(true, 3),
      }))).toEqual({ action: 'load-more', count: 10 });
    });

    it('enchaine simplement tant qu\'il reste des questions chargees', () => {
      expect(complices.afterRound(ctx({
        questionIndex: 4, loadedQuestions: 5, roundAgreements: repeat(true, 3),
      }))).toEqual({ action: 'next-question' });
    });

    it('recharge aussi quand l\'index depasse le vivier', () => {
      expect(complices.afterRound(ctx({
        questionIndex: 12, loadedQuestions: 5, roundAgreements: [],
      }))).toEqual({ action: 'load-more', count: 10 });
    });

    it('la fin de serie prime sur le rechargement', () => {
      expect(complices.afterRound(ctx({
        questionIndex: 5, loadedQuestions: 5, roundAgreements: repeat(true, 10),
      })).action).toBe('finish');
    });

    it('demarre sans historique sans planter', () => {
      expect(complices.afterRound(ctx({ questionIndex: 1, loadedQuestions: 10, roundAgreements: [] })))
        .toEqual({ action: 'next-question' });
    });
  });

  describe('absence d\'adversaire', () => {
    it('ignore totalement les scores', () => {
      const base = { questionIndex: 1, loadedQuestions: 10, roundAgreements: repeat(true, 4) };
      expect(complices.afterRound(ctx({ ...base, scores: { player1: 900, player2: 0 } })))
        .toEqual(complices.afterRound(ctx({ ...base, scores: { player1: 0, player2: 900 } })));
    });

    it('ignore le gagnant de la manche', () => {
      const base = { questionIndex: 1, loadedQuestions: 10, roundAgreements: repeat(true, 4) };
      expect(complices.afterRound(ctx({ ...base, roundWinner: 1 })))
        .toEqual(complices.afterRound(ctx({ ...base, roundWinner: 2 })));
    });

    it('ignore l\'historique des gagnants de manche', () => {
      const base = { questionIndex: 1, loadedQuestions: 10, roundAgreements: repeat(true, 4) };
      expect(complices.afterRound(ctx({ ...base, roundWinners: [1, 1, 1, 1] })))
        .toEqual(complices.afterRound(ctx({ ...base, roundWinners: [] })));
    });
  });
});

describe('Mode mort subite — trois vies chacun', () => {
  describe('decompte des vies', () => {
    for (let manchesPerdues = 0; manchesPerdues <= 2; manchesPerdues++) {
      it(`le joueur 2 survit apres ${manchesPerdues} manche(s) perdue(s)`, () => {
        expect(mortSubite.afterRound(ctx({
          questionIndex: 1, loadedQuestions: 10, roundWinners: repeat<1 | 2 | null>(1, manchesPerdues),
        })).action).not.toBe('finish');
      });
    }

    it('termine quand le joueur 2 a perdu ses trois vies', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundWinners: [1, 1, 1],
      }))).toEqual({ action: 'finish', reason: 'Plus de vies' });
    });

    it('termine quand le joueur 1 a perdu ses trois vies', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundWinners: [2, 2, 2],
      }))).toEqual({ action: 'finish', reason: 'Plus de vies' });
    });

    it('termine aussi au-dela de trois defaites', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundWinners: [1, 1, 1, 1, 1],
      })).action).toBe('finish');
    });

    it('des defaites reparties ne suffisent pas a terminer', () => {
      // Deux vies perdues chacun : personne n'est elimine.
      expect(mortSubite.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundWinners: [1, 2, 1, 2],
      })).action).not.toBe('finish');
    });

    it('termine des que l\'un des deux tombe a zero, meme si l\'autre a souffert', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundWinners: [1, 2, 1, 2, 1],
      })).action).toBe('finish');
    });

    it('compte les defaites, pas les victoires : une longue serie de nuls n\'elimine personne', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundWinners: repeat<1 | 2 | null>(null, 40),
      })).action).not.toBe('finish');
    });

    it('les manches nulles n\'interrompent pas le decompte des vies', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundWinners: [1, null, 1, null, 1],
      })).action).toBe('finish');
    });

    it('deux defaites plus une nulle laisse le joueur en vie', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10, roundWinners: [1, null, 1, null],
      })).action).not.toBe('finish');
    });
  });

  describe('alimentation du vivier', () => {
    it('recharge dix questions quand le vivier est epuise', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 4, loadedQuestions: 4, roundWinners: [1, 2],
      }))).toEqual({ action: 'load-more', count: 10 });
    });

    it('enchaine tant qu\'il reste des questions', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 3, loadedQuestions: 4, roundWinners: [1, 2],
      }))).toEqual({ action: 'next-question' });
    });

    it('l\'elimination prime sur le rechargement', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 4, loadedQuestions: 4, roundWinners: [2, 2, 2],
      })).action).toBe('finish');
    });

    it('demarre sans historique de manches', () => {
      expect(mortSubite.afterRound(ctx({ questionIndex: 1, loadedQuestions: 10, roundWinners: [] })))
        .toEqual({ action: 'next-question' });
    });
  });

  describe('independance vis-a-vis des scores', () => {
    it('un enorme ecart de points ne termine pas la partie', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 1, loadedQuestions: 10,
        roundWinners: [1, 1], scores: { player1: 5000, player2: -200 },
      })).action).not.toBe('finish');
    });

    it('ignore les accords de manche', () => {
      const base = { questionIndex: 1, loadedQuestions: 10, roundWinners: [1, 2] as (1 | 2 | null)[] };
      expect(mortSubite.afterRound(ctx({ ...base, roundAgreements: repeat(true, 20) })))
        .toEqual(mortSubite.afterRound(ctx({ ...base, roundAgreements: [] })));
    });

    it('ignore le nombre de questions demande a la creation du salon', () => {
      expect(mortSubite.afterRound(ctx({
        questionIndex: 30, loadedQuestions: 40, roundWinners: [1],
        settings: { questionCount: 5, categories: [], questionTypes: [] },
      })).action).toBe('next-question');
    });
  });
});
