import { getGameMode, listGameModes } from '../services/gameModes.js';
import type { GameModeDefinition } from '../services/gameModes.js';
import { ctx } from './helpers/modeContext.js';

/**
 * Le registre de modes est la source de verite du moteur : `gameService`
 * n'appelle QUE `getGameMode(...).afterRound(...)`. Un mode absent, mal nomme
 * ou degrade silencieusement en "classic" rend un jeu entier injouable sans
 * qu'aucune erreur ne remonte — c'est exactement ce qui etait arrive a 6 modes
 * sur 8 avant l'introduction de ce registre.
 */

const ATTENDUS: { id: string; endless: boolean; icon: string }[] = [
  { id: 'classic', endless: false, icon: '🎯' },
  { id: 'duel', endless: true, icon: '⚔️' },
  { id: 'escalade', endless: false, icon: '🌡️' },
  { id: 'complices', endless: true, icon: '🤝' },
  { id: 'sudden_death', endless: true, icon: '💀' },
  { id: 'inverse', endless: true, icon: '🔄' },
  { id: 'envies', endless: false, icon: '💫' },
  { id: 'petits_noms', endless: false, icon: '🐻' },
  { id: 'mix', endless: true, icon: '🎲' },
];

describe('Registre des modes de jeu', () => {
  const modes = listGameModes();

  it('publie au moins les neuf modes historiques du catalogue', () => {
    expect(modes.length).toBeGreaterThanOrEqual(ATTENDUS.length);
  });

  it('publie les identifiants attendus, sans oubli', () => {
    const publies = modes.map(m => m.id);
    expect(ATTENDUS.map(m => m.id).filter(id => !publies.includes(id))).toEqual([]);
  });

  it('ne declare jamais deux fois le meme identifiant', () => {
    expect(new Set(modes.map(m => m.id)).size).toBe(modes.length);
  });

  it('ne declare jamais deux fois le meme libelle', () => {
    expect(new Set(modes.map(m => m.label)).size).toBe(modes.length);
  });

  for (const attendu of ATTENDUS) {
    describe(`mode « ${attendu.id} »`, () => {
      const mode = getGameMode(attendu.id);

      it('est resolu par son identifiant et non degrade en classique', () => {
        expect(mode.id).toBe(attendu.id);
      });

      it('figure dans la liste renvoyee au client', () => {
        expect(modes.some(m => m.id === attendu.id)).toBe(true);
      });

      it('porte un libelle affichable', () => {
        expect(mode.label.trim().length).toBeGreaterThan(2);
      });

      it('porte une description affichable', () => {
        expect(mode.description.trim().length).toBeGreaterThan(10);
      });

      it("porte l'icone attendue par le catalogue client", () => {
        expect(mode.icon).toBe(attendu.icon);
      });

      it(`declare endless = ${attendu.endless}`, () => {
        expect(mode.endless).toBe(attendu.endless);
      });

      it('expose une fonction afterRound', () => {
        expect(typeof mode.afterRound).toBe('function');
      });

      it('expose une fonction initialQuestionCount', () => {
        expect(typeof mode.initialQuestionCount).toBe('function');
      });

      it('amorce la partie avec au moins une question', () => {
        const n = mode.initialQuestionCount({ questionCount: 10, categories: [], questionTypes: [] });
        expect(n).toBeGreaterThanOrEqual(1);
      });

      it('rend une decision reconnue par le moteur', () => {
        const decision = mode.afterRound(ctx({ questionIndex: 1 }));
        expect([
          'next-question', 'load-more', 'finish', 'await-theme-choice',
          'next-from-category', 'next-inverted', 'await-palier-consent',
        ]).toContain(decision.action);
      });

      it('ne modifie pas le contexte qu\'on lui passe', () => {
        const c = ctx({ questionIndex: 2, roundWinners: [1], roundAgreements: [true] });
        const avant = JSON.stringify({ ...c, roundWinners: c.roundWinners, roundAgreements: c.roundAgreements });
        mode.afterRound(c);
        expect(JSON.stringify({ ...c, roundWinners: c.roundWinners, roundAgreements: c.roundAgreements })).toBe(avant);
      });

      it('rend deux fois la meme decision pour un meme contexte deterministe', () => {
        // Seuls les modes tirant un theme au hasard peuvent varier ; aucun ne le fait.
        const c = ctx({ questionIndex: 1, roundWinner: 1, roundWinners: [1], roundAgreements: [true] });
        expect(mode.afterRound(c)).toEqual(mode.afterRound(c));
      });
    });
  }

  describe('resolution d\'un identifiant', () => {
    const inconnus: [string, string][] = [
      ['une chaine vide', ''],
      ['un identifiant inexistant', 'poker'],
      ['une casse differente', 'CLASSIC'],
      ['un identifiant capitalise', 'Duel'],
      ['un identifiant entoure d\'espaces', ' classic '],
      ['un identifiant avec tiret', 'sudden-death'],
      ['un identifiant du frontend non supporte', 'petitsNoms'],
    ];

    for (const [libelle, valeur] of inconnus) {
      it(`retombe sur le mode classique pour ${libelle}`, () => {
        expect(getGameMode(valeur).id).toBe('classic');
      });
    }

    it('retombe sur le mode classique quand aucun mode n\'est fourni', () => {
      expect(getGameMode(undefined).id).toBe('classic');
    });

    it('renvoie toujours un objet exploitable, jamais undefined', () => {
      const mode: GameModeDefinition = getGameMode('n\'importe quoi');
      expect(mode.afterRound).toBeInstanceOf(Function);
    });

    it('renvoie la meme instance pour deux appels sur le meme identifiant', () => {
      expect(getGameMode('duel')).toBe(getGameMode('duel'));
    });

    it('listGameModes renvoie les memes objets que getGameMode', () => {
      for (const m of listGameModes()) {
        expect(getGameMode(m.id)).toBe(m);
      }
    });
  });

  describe('amorcage du nombre de questions', () => {
    it('le mode classique charge exactement le nombre demande', () => {
      for (const n of [5, 10, 15, 20, 30, 50]) {
        expect(getGameMode('classic').initialQuestionCount({
          questionCount: n, categories: [], questionTypes: [],
        })).toBe(n);
      }
    });

    it('un mode a liste fixe recharge le nombre demande, pas une valeur en dur', () => {
      // Garde-fou : `initialQuestionCount` doit dependre du reglage, sinon un
      // hote qui demande 20 questions en jouerait 10.
      const classique = getGameMode('classic');
      expect(classique.initialQuestionCount({ questionCount: 20, categories: [], questionTypes: [] }))
        .not.toBe(classique.initialQuestionCount({ questionCount: 7, categories: [], questionTypes: [] }));
    });

    const enBoucle = ['duel', 'escalade', 'complices', 'sudden_death', 'inverse', 'envies', 'petits_noms', 'mix'];
    for (const id of enBoucle) {
      it(`le mode ${id} n'amorce qu'une seule question, quel que soit le reglage`, () => {
        expect(getGameMode(id).initialQuestionCount({
          questionCount: 50, categories: ['couple'], questionTypes: ['A'],
        })).toBe(1);
      });
    }
  });
});
