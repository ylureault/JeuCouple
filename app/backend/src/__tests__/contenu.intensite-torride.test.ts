import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, initDatabase } from '../database.js';
import * as questionModel from '../models/question.js';

/**
 * Echelle d'intensite du Mix Torride (curseur 1-10 de l'accueil).
 *
 * L'echelle vit dans le front (`Home.tsx`), mais les thèmes qu'elle nomme
 * vivent en base. Rien ne relie les deux : renommer une categorie cote serveur
 * laisserait un cran du curseur ouvrir un theme qui n'existe plus — la partie
 * demarrerait sur un vivier vide, sans qu'aucun test cote front ne bronche.
 * Ce test lit la source du curseur et confronte chaque palier au catalogue.
 */

const __dirnameESM = path.dirname(fileURLToPath(import.meta.url));
const homeSrc = readFileSync(
  path.join(__dirnameESM, '../../../frontend/src/pages/Home.tsx'),
  'utf-8'
);

/** Extrait les paliers declares dans PALIERS_TORRIDES, dans l'ordre. */
function lirePaliers(): string[][] {
  const bloc = homeSrc.match(/const PALIERS_TORRIDES[\s\S]*?\n\];/);
  if (!bloc) throw new Error('PALIERS_TORRIDES introuvable dans Home.tsx');
  return [...bloc[0].matchAll(/ajoute:\s*\[([^\]]*)\]/g)].map(m =>
    [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
  );
}

const paliers = lirePaliers();

/**
 * Le vivier reel d'un theme = le seed (en base ici) PLUS les lots de data/,
 * que l'import verse en production. Ne compter que la base sous-estimerait
 * "Preliminaires" d'un facteur six.
 */
const dataDir = path.join(__dirnameESM, '../../data');
const parCategorieDansLesFichiers = new Map<string, number>();
for (const f of readdirSync(dataDir).filter(x => x.endsWith('.json'))) {
  const lot = JSON.parse(readFileSync(path.join(dataDir, f), 'utf-8'));
  for (const q of lot.questions ?? []) {
    parCategorieDansLesFichiers.set(q.category, (parCategorieDansLesFichiers.get(q.category) ?? 0) + 1);
  }
}

function vivier(themes: string[]): number {
  const enBase = (db.prepare(
    `SELECT COUNT(*) n FROM questions WHERE active = 1 AND category IN (${themes.map(() => '?').join(',')})`
  ).get(...themes) as { n: number }).n;
  return enBase + themes.reduce((s, c) => s + (parCategorieDansLesFichiers.get(c) ?? 0), 0);
}

beforeAll(() => {
  initDatabase();
});

describe("L'echelle d'intensite", () => {
  it('compte bien dix crans', () => {
    expect(paliers).toHaveLength(10);
  });

  it("n'ouvre jamais deux fois le meme theme", () => {
    const tous = paliers.flat();
    expect(tous).toHaveLength(new Set(tous).size);
  });

  it('ne nomme que des categories enregistrees', () => {
    const connues = new Set(
      (db.prepare('SELECT code FROM categories WHERE active = 1').all() as { code: string }[])
        .map(r => r.code)
    );
    const inconnues = paliers.flat().filter(c => !connues.has(c));
    expect(inconnues).toEqual([]);
  });
});

describe('Chaque cran est jouable', () => {
  const cumul: string[][] = paliers.map((_, i) => paliers.slice(0, i + 1).flat());

  for (let i = 0; i < cumul.length; i++) {
    const themes = cumul[i];

    // 50 = la plus longue partie possible (le curseur de questions plafonne la).
    // Un cran qui n'atteint pas ce seuil rejouerait des questions dans la
    // meme partie.
    it(`le niveau ${i + 1} dispose d'un vivier d'au moins 50 questions`, () => {
      expect(vivier(themes)).toBeGreaterThanOrEqual(50);
    });
  }

  it('le niveau 1 sert de vraies questions jouables', () => {
    const tirage = questionModel.getMixedQuestions(10, paliers[0], [], []);
    expect(tirage.length).toBeGreaterThan(0);
    expect(tirage.every(q => paliers[0].includes(q.category))).toBe(true);
  });

  it('monter d’un cran ne retire jamais un theme', () => {
    for (let i = 1; i < cumul.length; i++) {
      expect(cumul[i]).toEqual(expect.arrayContaining(cumul[i - 1]));
    }
  });

  it('le dernier cran ouvre strictement plus de questions que le premier', () => {
    expect(vivier(cumul[cumul.length - 1])).toBeGreaterThan(vivier(cumul[0]));
  });
});
