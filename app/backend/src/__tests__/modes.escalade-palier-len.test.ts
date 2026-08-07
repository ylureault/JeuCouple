import { ctx } from './helpers/modeContext.js';
import type { GameModeDefinition } from '../services/gameModes.js';

/**
 * ESCALADE_PALIER_LEN est lu UNE FOIS au chargement du registre. Ce fichier
 * n'importe donc `gameModes` que dynamiquement, apres avoir pose la variable :
 * c'est la seule facon de prouver que le reglage est reellement pris en compte
 * (les tests fonctionnels d'escalade s'appuient dessus pour atteindre un palier
 * en une seule manche au lieu de trois).
 */
describe('Mode escalade — longueur de palier surchargeable par l\'environnement', () => {
  let escalade: GameModeDefinition;

  beforeAll(async () => {
    process.env.ESCALADE_PALIER_LEN = '1';
    const registre = await import('../services/gameModes.js');
    escalade = registre.getGameMode('escalade');
  });

  afterAll(() => {
    delete process.env.ESCALADE_PALIER_LEN;
  });

  it('propose la premiere montee des la deuxieme manche', () => {
    expect(escalade.afterRound(ctx({ questionIndex: 1, acquiredPalier: 0 }))).toEqual({
      action: 'await-palier-consent',
      nextCategory: 'souvenirs',
      stayCategory: 'couple',
      palier: 1,
    });
  });

  it('sert encore le premier palier a la manche zero', () => {
    expect(escalade.afterRound(ctx({ questionIndex: 0, acquiredPalier: 0 })))
      .toEqual({ action: 'next-from-category', category: 'couple' });
  });

  it('propose une montee a chaque manche tant que l\'echelle n\'est pas finie', () => {
    for (let palier = 0; palier < 7; palier++) {
      const d = escalade.afterRound(ctx({ questionIndex: palier + 1, acquiredPalier: palier }));
      expect(d.action).toBe('await-palier-consent');
    }
  });

  it('termine la partie apres huit manches au lieu de vingt-quatre', () => {
    expect(escalade.afterRound(ctx({ questionIndex: 8, acquiredPalier: 7 })).action).toBe('finish');
  });

  it('ne termine pas avant la huitieme manche', () => {
    expect(escalade.afterRound(ctx({ questionIndex: 7, acquiredPalier: 7 })).action).not.toBe('finish');
  });
});
