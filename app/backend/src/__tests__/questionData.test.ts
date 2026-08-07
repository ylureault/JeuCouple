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

  it('ne repete pas le meme enonce dans une meme categorie', () => {
    // Un enonce generique repete donne au joueur l'impression de retomber
    // toujours sur la meme question : "Tu preferes..." apparaissait 155 fois,
    // seules les deux options changeant.
    const seen = new Map<string, number>();
    for (const { q } of questions) {
      const key = `${q.category}::${q.text}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const repeated = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(repeated).toEqual([]);
  });

  it('donne deux emojis aux choix visuels (type I)', () => {
    const broken = questions
      .filter(({ q }) => q.type === 'I')
      .filter(({ q }) => !(q as { emoji_a?: string }).emoji_a || !(q as { emoji_b?: string }).emoji_b)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('ne laisse aucune coquille d\'accent dans les enonces', () => {
    // 405 enonces du seed etaient ecrits sans accents ("ideal", "apres",
    // "preferes"), ce qui se voyait immediatement en jeu.
    const missing = /\b(ideal|ideale|apres|preferes?|reve|experience|premiere|serieux|decris|societe|serie)\b/i;
    const broken = questions
      .filter(({ q }) => missing.test(q.text))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('garde des codes de categorie sans accent dans le seed', () => {
    // Les codes de categorie sont des identifiants techniques compares a
    // l'octet pres. Une passe de correction orthographique avait accentue
    // `category: 'preferences'` en 'préférences' : 118 questions se
    // retrouvaient rattachees a une categorie inexistante, donc injouables.
    // Les tests precedents ne lisaient que data/, pas le seed de database.ts.
    const accented = [...databaseSrc.matchAll(/category:\s*'([^']*[À-ÿ][^']*)'/g)].map(m => m[1]);
    expect([...new Set(accented)]).toEqual([]);
  });

  it('n\'utilise dans le seed que des categories jouables', () => {
    // Une categorie du seed est acceptable si elle est enregistree, ou si
    // mergeLegacyCategories() la rattache au demarrage a une categorie qui
    // l'est (cas des codes historiques amour, quotidien, connaissance...).
    const merged = new Set(
      [...databaseSrc.matchAll(/^\s*(\w+):\s*'(\w+)',\s*\/\//gm)]
        .filter(m => known.has(m[2]))
        .map(m => m[1])
    );
    const used = [...databaseSrc.matchAll(/category:\s*'([^']+)'/g)].map(m => m[1]);
    const unplayable = [...new Set(used)].filter(c => !known.has(c) && !merged.has(c));
    expect(unplayable).toEqual([]);
  });

  it('donne un minuteur exploitable a chaque question', () => {
    const broken = questions
      .filter(({ q }) => typeof q.timer !== 'number' || q.timer < 5 || q.timer > 120)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  // --- Garde-fous complementaires -----------------------------------------

  const TYPES_CONNUS = 'ABCDEFGHIJKLMNOPQRS'.split('');

  it('n\'utilise que des types de saisie connus du moteur', () => {
    const inconnus = [...new Set(
      questions.filter(({ q }) => !TYPES_CONNUS.includes(q.type)).map(({ q }) => q.type)
    )];
    expect(inconnus).toEqual([]);
  });

  it('donne un enonce non vide a chaque question', () => {
    const broken = questions
      .filter(({ q }) => typeof q.text !== 'string' || q.text.trim().length === 0)
      .map(({ file }) => file);
    expect(broken).toEqual([]);
  });

  it('garde des enonces lisibles sur un telephone (250 caracteres maximum)', () => {
    const broken = questions
      .filter(({ q }) => q.text.length > 250)
      .map(({ file, q }) => `${file}: ${q.text.slice(0, 60)}...`);
    expect(broken).toEqual([]);
  });

  it('n\'introduit ni retour a la ligne ni tabulation dans les enonces', () => {
    const broken = questions
      .filter(({ q }) => /[\n\r\t]/.test(q.text))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('ne laisse ni espace superflu ni double espace dans les enonces', () => {
    const broken = questions
      .filter(({ q }) => q.text !== q.text.trim() || /  /.test(q.text))
      .map(({ file, q }) => `${file}: [${q.text}]`);
    expect(broken).toEqual([]);
  });

  it('n\'injecte aucun balisage HTML dans les enonces', () => {
    const broken = questions
      .filter(({ q }) => /<[a-z/]/i.test(q.text))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('utilise des codes de categorie techniques (minuscules, chiffres, tiret bas)', () => {
    const invalides = [...new Set(
      questions.filter(({ q }) => !/^[a-z0-9_]+$/.test(q.category)).map(({ q }) => q.category)
    )];
    expect(invalides).toEqual([]);
  });

  it('propose entre deux et six options aux questions a choix', () => {
    const broken = questions
      .filter(({ q }) => Array.isArray(q.options))
      .filter(({ q }) => q.options!.length < 2 || q.options!.length > 6)
      .map(({ file, q }) => `${file}: ${q.text} (${q.options!.length})`);
    expect(broken).toEqual([]);
  });

  it('ne propose jamais une option vide ou mal detouree', () => {
    const broken = questions
      .filter(({ q }) => Array.isArray(q.options))
      .filter(({ q }) => q.options!.some(o => typeof o !== 'string' || o.trim().length === 0 || o !== o.trim()))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('ne propose pas deux fois la meme chose dans un choix binaire (type E)', () => {
    const broken = questions
      .filter(({ q }) => q.type === 'E' && q.option_a === q.option_b)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('donne deux emojis distincts aux choix visuels (type I)', () => {
    const broken = questions
      .filter(({ q }) => q.type === 'I')
      .filter(({ q }) => (q as { emoji_a?: string }).emoji_a === (q as { emoji_b?: string }).emoji_b)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('propose au moins trois options aux QCM de culture generale (type H)', () => {
    const broken = questions
      .filter(({ q }) => q.type === 'H' && (q.options ?? []).length < 3)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('ne declare une bonne reponse que sur les types qui en ont une (H)', () => {
    const broken = questions
      .filter(({ q }) => q.type !== 'H' && !!q.correct_answer)
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('reserve le substitut {player} au type « Vrai ou Faux » (G)', () => {
    const broken = questions
      .filter(({ q }) => q.type !== 'G' && /\{player\}/i.test(q.text))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('ne donne pas d\'options aux types a interface fixe (C, D, F, G)', () => {
    const broken = questions
      .filter(({ q }) => ['C', 'D', 'F', 'G'].includes(q.type) && Array.isArray(q.options))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('donne un nombre de reference aux questions Plus/Moins (type N)', () => {
    const broken = questions
      .filter(({ q }) => q.type === 'N')
      .filter(({ q }) => typeof (q as { reference_value?: number }).reference_value !== 'number')
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('donne trois elements a classer aux questions Top 3 (type M)', () => {
    const broken = questions
      .filter(({ q }) => q.type === 'M')
      .filter(({ q }) => !Array.isArray((q as { ranking_items?: string[] }).ranking_items))
      .map(({ file, q }) => `${file}: ${q.text}`);
    expect(broken).toEqual([]);
  });

  it('accorde plus de temps aux questions ouvertes qu\'aux choix binaires', () => {
    const moyenne = (type: string) => {
      const t = questions.filter(({ q }) => q.type === type).map(({ q }) => q.timer ?? 0);
      return t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0;
    };
    expect(moyenne('C')).toBeGreaterThan(moyenne('E'));
  });

  it('couvre au moins huit themes distincts', () => {
    expect(new Set(questions.map(({ q }) => q.category)).size).toBeGreaterThanOrEqual(8);
  });

  it('couvre au moins cinq types de saisie distincts', () => {
    expect(new Set(questions.map(({ q }) => q.type)).size).toBeGreaterThanOrEqual(5);
  });

  it('ne laisse aucun fichier de donnees vide', () => {
    const parFichier = new Map<string, number>();
    for (const { file } of questions) parFichier.set(file, (parFichier.get(file) ?? 0) + 1);
    expect([...parFichier.entries()].filter(([, n]) => n === 0)).toEqual([]);
    expect(parFichier.size).toBeGreaterThan(10);
  });
});
