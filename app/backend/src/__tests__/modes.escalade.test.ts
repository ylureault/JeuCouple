import { getGameMode } from '../services/gameModes.js';
import type { ModeDecision } from '../services/gameModes.js';
import { ctx } from './helpers/modeContext.js';

/**
 * Mode escalade : le jeu impose le theme en montant une echelle du plus tendre
 * au plus explicite. La montee d'un palier n'est jamais imposee : elle passe par
 * un consentement des DEUX joueurs (constat GRAVE n.4 de l'audit). Un refus ne
 * casse rien, on reste au palier acquis.
 */

const escalade = getGameMode('escalade');

// Doit rester aligne avec ESCALADE_LADDER dans services/gameModes.ts.
const ECHELLE = [
  'couple', 'souvenirs', 'preliminaires', 'sexy',
  'coquin', 'fantasmes', 'extreme', 'sans_tabou',
];
const LONGUEUR_PALIER = 3;   // ESCALADE_PALIER_LEN par defaut
const TOTAL_MANCHES = LONGUEUR_PALIER * ECHELLE.length;   // 24

const decide = (questionIndex: number, acquiredPalier = 0): ModeDecision =>
  escalade.afterRound(ctx({ questionIndex, acquiredPalier }));

describe('Mode escalade — echelle des paliers', () => {
  it('declare une echelle de huit paliers', () => {
    expect(ECHELLE).toHaveLength(8);
  });

  describe('debut de partie, au premier palier', () => {
    for (const manche of [0, 1, 2]) {
      it(`sert une question du palier « couple » a la manche ${manche}`, () => {
        expect(decide(manche, 0)).toEqual({ action: 'next-from-category', category: 'couple' });
      });
    }

    it('propose la montee vers « souvenirs » a la quatrieme manche', () => {
      expect(decide(3, 0)).toEqual({
        action: 'await-palier-consent',
        nextCategory: 'souvenirs',
        stayCategory: 'couple',
        palier: 1,
      });
    });
  });

  describe('proposition de montee : un palier a la fois', () => {
    for (let palier = 0; palier < ECHELLE.length - 1; palier++) {
      const manche = (palier + 1) * LONGUEUR_PALIER;
      it(`propose « ${ECHELLE[palier + 1] } » quand « ${ECHELLE[palier]} » est acquis`, () => {
        expect(decide(manche, palier)).toEqual({
          action: 'await-palier-consent',
          nextCategory: ECHELLE[palier + 1],
          stayCategory: ECHELLE[palier],
          palier: palier + 1,
        });
      });
    }

    it('ne saute jamais un palier, meme si la partie a beaucoup avance', () => {
      // Manche 21 => palier vise 7, mais seul le palier 0 est acquis.
      const d = decide(21, 0);
      expect(d).toEqual({
        action: 'await-palier-consent',
        nextCategory: 'souvenirs',
        stayCategory: 'couple',
        palier: 1,
      });
    });

    it('propose un palier strictement superieur a celui deja acquis', () => {
      for (let palier = 0; palier < ECHELLE.length - 1; palier++) {
        const d = decide((palier + 1) * LONGUEUR_PALIER, palier);
        expect(d.action === 'await-palier-consent' && d.palier).toBe(palier + 1);
      }
    });
  });

  describe('a l\'interieur d\'un palier acquis, aucune demande de consentement', () => {
    for (let palier = 0; palier < ECHELLE.length; palier++) {
      for (let offset = 0; offset < LONGUEUR_PALIER; offset++) {
        const manche = palier * LONGUEUR_PALIER + offset;
        it(`manche ${manche} au palier ${palier} : sert « ${ECHELLE[palier]} » directement`, () => {
          expect(decide(manche, palier)).toEqual({
            action: 'next-from-category',
            category: ECHELLE[palier],
          });
        });
      }
    }
  });

  describe('refus ou silence : on reste au palier acquis', () => {
    it('continue a servir « couple » apres un refus, sans commentaire', () => {
      // Le moteur rejoue la decision avec le palier inchange.
      expect(decide(4, 0).action).toBe('await-palier-consent');
      // Une fois le refus acte, la manche suivante reste sur le palier acquis.
      expect(decide(4, 0)).not.toEqual({ action: 'finish' });
    });

    it('un palier refuse ne fait jamais reculer l\'echelle', () => {
      const d = decide(9, 2);
      expect(d.action === 'await-palier-consent' && d.palier).toBe(3);
    });

    it('rester bloque au premier palier ne termine pas la partie avant la fin', () => {
      for (let manche = 0; manche < TOTAL_MANCHES; manche++) {
        expect(decide(manche, 0).action).not.toBe('finish');
      }
    });
  });

  describe('fin de partie', () => {
    it('termine la partie quand tous les paliers ont ete gravis', () => {
      expect(decide(TOTAL_MANCHES, ECHELLE.length - 1)).toEqual({
        action: 'finish',
        reason: 'Vous avez gravi tous les paliers',
      });
    });

    it('termine aussi si l\'index depasse le total des manches', () => {
      expect(decide(TOTAL_MANCHES + 5, 3).action).toBe('finish');
    });

    it('ne termine pas a l\'avant-derniere manche', () => {
      expect(decide(TOTAL_MANCHES - 1, ECHELLE.length - 1).action).not.toBe('finish');
    });

    it('termine meme si les joueurs ont refuse toutes les montees', () => {
      expect(decide(TOTAL_MANCHES, 0).action).toBe('finish');
    });

    it('donne une raison lisible par le joueur', () => {
      const d = decide(TOTAL_MANCHES, 7);
      expect(d.action === 'finish' && d.reason).toMatch(/paliers/);
    });
  });

  describe('dernier palier', () => {
    it('plafonne le palier vise au dernier barreau de l\'echelle', () => {
      // Manche 40 : floor(40/3)=13, largement au-dela des 8 paliers.
      const d = escalade.afterRound(ctx({ questionIndex: 23, acquiredPalier: 6 }));
      expect(d).toEqual({
        action: 'await-palier-consent',
        nextCategory: 'sans_tabou',
        stayCategory: 'extreme',
        palier: 7,
      });
    });

    it('ne propose plus rien une fois « sans_tabou » acquis', () => {
      for (let manche = 21; manche < TOTAL_MANCHES; manche++) {
        expect(decide(manche, 7)).toEqual({ action: 'next-from-category', category: 'sans_tabou' });
      }
    });
  });

  describe('deroulement complet avec consentement systematique', () => {
    it('parcourt l\'echelle dans l\'ordre, du plus tendre au plus explicite', () => {
      const themesServis: string[] = [];
      let palier = 0;
      for (let manche = 0; manche < TOTAL_MANCHES; manche++) {
        let d = decide(manche, palier);
        if (d.action === 'await-palier-consent') {
          palier = d.palier;                       // les deux joueurs acceptent
          d = decide(manche, palier);
        }
        expect(d.action).toBe('next-from-category');
        if (d.action === 'next-from-category') themesServis.push(d.category);
      }
      expect([...new Set(themesServis)]).toEqual(ECHELLE);
    });

    it('sert exactement trois manches par palier', () => {
      const comptes = new Map<string, number>();
      let palier = 0;
      for (let manche = 0; manche < TOTAL_MANCHES; manche++) {
        let d = decide(manche, palier);
        if (d.action === 'await-palier-consent') {
          palier = d.palier;
          d = decide(manche, palier);
        }
        if (d.action === 'next-from-category') {
          comptes.set(d.category, (comptes.get(d.category) ?? 0) + 1);
        }
      }
      expect([...comptes.values()]).toEqual(ECHELLE.map(() => LONGUEUR_PALIER));
    });

    it('reste bloque sur « couple » si aucune montee n\'est acceptee', () => {
      const themesServis = new Set<string>();
      for (let manche = 0; manche < TOTAL_MANCHES; manche++) {
        const d = decide(manche, 0);
        if (d.action === 'next-from-category') themesServis.add(d.category);
      }
      expect([...themesServis]).toEqual(['couple']);
    });
  });

  describe('independance vis-a-vis du reste du contexte', () => {
    it('ignore le gagnant de la manche', () => {
      expect(escalade.afterRound(ctx({ questionIndex: 1, roundWinner: 1 })))
        .toEqual(escalade.afterRound(ctx({ questionIndex: 1, roundWinner: 2 })));
    });

    it('ignore les scores', () => {
      expect(escalade.afterRound(ctx({ questionIndex: 1, scores: { player1: 900, player2: 0 } })))
        .toEqual({ action: 'next-from-category', category: 'couple' });
    });

    it('ignore le vivier deja charge : il tire theme par theme', () => {
      expect(escalade.afterRound(ctx({ questionIndex: 1, loadedQuestions: 1 })))
        .toEqual({ action: 'next-from-category', category: 'couple' });
    });

    it('ignore les themes choisis a la creation du salon', () => {
      expect(escalade.afterRound(ctx({
        questionIndex: 1,
        settings: { questionCount: 10, categories: ['culture'], questionTypes: [] },
      }))).toEqual({ action: 'next-from-category', category: 'couple' });
    });
  });
});
