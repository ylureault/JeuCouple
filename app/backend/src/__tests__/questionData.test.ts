import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Le projet est en ESM : __dirname n'existe pas, on le reconstruit.
const __dirnameESM = path.dirname(fileURLToPath(import.meta.url));

/**
 * Garde-fous sur le contenu des questions.
 *
 * Ces tests existent parce que 690 questions (17% du jeu) etaient importees en
 * base mais totalement injouables : leur categorie n'etait declaree nulle part,
 * et le selecteur de themes ne liste que la table categories. Rien ne le
 * signalait. Le meme silence couvrait 131 questions dont le type de saisie
 * contredisait l'enonce.
 */

const dataDir = path.join(__dirnameESM, '../../data');
const databaseSrc = readFileSync(path.join(__dirnameESM, '../database.ts'), 'utf-8');

interface RawQuestion {
  type: string;
  category: string;
  text: string;
  options?: string[];
  option_a?: string;
  option_b?: string;
  correct_answer?: string;
  timer?: number;
}

/** Categories reellement seedees au demarrage (source de verite). */
function seededCategories(): Set<string> {
  const block = databaseSrc.slice(databaseSrc.indexOf('function initDefaultCategories'));
  const end = block.indexOf('const insert = db.prepare');
  return new Set(
    [...block.slice(0, end).matchAll(/\{\s*code:\s*'([^']+)'/g)].map(m => m[1])
  );
}

function allQuestions(): { file: string; q: RawQuestion }[] {
  const out: { file: string; q: RawQuestion }[] = [];
  for (const file of readdirSync(dataDir).filter(f => f.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(path.join(dataDir, file), 'utf-8'));
    if (!Array.isArray(parsed.questions)) continue;
    for (const q of parsed.questions) out.push({ file, q });
  }
  return out;
}

describe('Contenu des questions', () => {
  const questions = allQuestions();
  const known = seededCategories();

  it('charge un corpus non vide', () => {
    expect(questions.length).toBeGreaterThan(1000);
  });

  it('n\'utilise que des categories enregistrees (sinon la question est injouable)', () => {
    const orphans = new Map<string, number>();
    for (const { q } of questions) {
      if (!known.has(q.category)) {
        orphans.set(q.category, (orphans.get(q.category) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(orphans)).toEqual({});
  });

  it('donne des options aux types a choix multiple (A, B, H)', () => {
    const broken = questions
      .filter(({ q }) => ['A', 'B', 'H'].includes(q.type))
      .filter(({ q }) => !Array.isArray(q.options) || q.options.length < 2)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('donne deux options aux choix binaires (type E)', () => {
    const broken = questions
      .filter(({ q }) => q.type === 'E')
      .filter(({ q }) => !q.option_a || !q.option_b)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('associe au type H une bonne reponse figurant parmi les options', () => {
    const broken = questions
      .filter(({ q }) => q.type === 'H')
      .filter(({ q }) => !q.correct_answer || !(q.options ?? []).includes(q.correct_answer))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('ne propose jamais deux options identiques', () => {
    const broken = questions
      .filter(({ q }) => Array.isArray(q.options))
      .filter(({ q }) => new Set(q.options).size !== q.options!.length)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('n\'envoie pas un enonce descriptif vers le curseur 1-10 (type D)', () => {
    // Le type D rend un curseur de 1 a 10 : "Decris en trois mots" y etait
    // inrepondable. 94 questions etaient dans ce cas.
    const descriptive = /^(décris|decris|quel mot|comment |qu'est-ce qui|qu'est-ce que|quel conseil)/i;
    const broken = questions
      .filter(({ q }) => q.type === 'D' && descriptive.test(q.text.trim()))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('n\'envoie pas un enonce "sur 10" vers le champ libre (type C)', () => {
    const scaleLike = /(sur 10|note sur 10|à quel point|a quel point)/i;
    const broken = questions
      .filter(({ q }) => q.type === 'C' && scaleLike.test(q.text))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('donne un minuteur exploitable a chaque question', () => {
    const broken = questions
      .filter(({ q }) => typeof q.timer !== 'number' || q.timer < 5 || q.timer > 120)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });
});
