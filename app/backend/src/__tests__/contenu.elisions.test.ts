import {
  db, initDatabase, fixMissingAccents, fixDegatsAccents, deactivateDuplicateQuestions,
} from '../database.js';

/**
 * Integrite du corpus : la migration d'accents et les doublons.
 *
 * `fixMissingAccents` restaure les accents des enonces deja en base. Sa
 * premiere version s'appuyait sur `\b`, qui raisonne sur [A-Za-z0-9_] et ignore
 * donc les lettres accentuees et les parentheses. Trois corruptions livrees :
 *   "rencontrés il" -> "rencontrés'il"
 *   "ami(e)s en"    -> "ami(e)s'en"
 *   "mètres"        -> "mètrès"
 * Elles rendaient aussi l'import instable : le texte en base ne correspondant
 * plus au fichier source, chaque import reinserait les memes questions.
 *
 * Ces tests verrouillent les trois moities : la regle n'abime plus rien, la
 * reparation rend leur forme aux bases deja installees, et le corpus livre ne
 * contient ni degat ni doublon.
 */

beforeAll(() => {
  initDatabase();
});

/** Motifs introuvables en francais correct — leur seule origine est le bug. */
const DEGAT_ELISION = /[àâäçéèêëîïôöùûü)][ldscjmnt]'[aeiouéèêîôûh]/i;
const DEGAT_TRES = /\p{L}très/u;

function poser(texte: string): number {
  return db.prepare(
    "INSERT INTO questions (type, category, text, timer, active) VALUES ('C','couple',?,20,1)"
  ).run(texte).lastInsertRowid as number;
}

function relire(id: number): string {
  return (db.prepare('SELECT text FROM questions WHERE id = ?').get(id) as { text: string }).text;
}

function nettoyer(id: number): void {
  db.prepare('DELETE FROM questions WHERE id = ?').run(id);
}

describe("La restauration des accents n'abime pas les enonces", () => {
  const intacts = [
    'Vous vous êtes rencontrés il y a combien de temps ?',
    'Les moments passés ensemble comptent-ils le plus ?',
    'Tu en as parlé à tes ami(e)s en détail ?',
    'Quel arbre peut dépasser 80 mètres de hauteur ?',
    "Ton plus beau souvenir est-il lié à un été ?",
  ];

  for (const texte of intacts) {
    it(`laisse « ${texte.slice(0, 40)}… » tel quel`, () => {
      const marqueur = ` #${Math.random()}`;
      const id = poser(texte + marqueur);
      fixMissingAccents();
      const apres = relire(id);
      nettoyer(id);
      expect(apres).toBe(texte + marqueur);
    });
  }
});

describe("La restauration des accents fait toujours son travail", () => {
  const attendus: [string, string][] = [
    ['Je pense a l amour tous les jours', "l'amour"],
    ['Il faut d abord se parler', "d'abord"],
    ['Dis-lui s il te plait', "s'il"],
    ['Ta journee ideale ressemble a quoi', 'journée'],
    ['Un moment tres fort de notre annee', 'très'],
    ['Ton activite favorite du week-end', 'activité'],
  ];

  for (const [avant, attendu] of attendus) {
    it(`ecrit « ${attendu} »`, () => {
      const id = poser(`${avant} #${Math.random()}`);
      fixMissingAccents();
      const apres = relire(id);
      nettoyer(id);
      expect(apres).toContain(attendu);
    });
  }
});

describe('Reparation des bases deja abimees', () => {
  const casses: [string, string][] = [
    ["Vous vous êtes rencontrés'il y a longtemps ?", 'rencontrés il y a longtemps'],
    ["Tu en as parlé à tes ami(e)s'en détail ?", 'ami(e)s en détail'],
    ['Un arbre de 80 mètrès de hauteur', '80 mètres de hauteur'],
  ];

  for (const [casse, attendu] of casses) {
    it(`rend sa forme a « ${attendu} »`, () => {
      const id = poser(`${casse} #${Math.random()}`);
      fixDegatsAccents();
      const apres = relire(id);
      nettoyer(id);
      expect(apres).toContain(attendu);
      expect(apres).not.toMatch(DEGAT_ELISION);
      expect(apres).not.toMatch(DEGAT_TRES);
    });
  }

  it('ne touche pas une elision legitime', () => {
    const texte = `On s'est dit qu'on irait jusqu'au bout, d'accord ? Aujourd'hui #${Math.random()}`;
    const id = poser(texte);
    fixDegatsAccents();
    const apres = relire(id);
    nettoyer(id);
    expect(apres).toBe(texte);
  });

  it('est idempotente : un second passage ne change plus rien', () => {
    const id = poser(`Les moments passés'ensemble comptent #${Math.random()}`);
    fixDegatsAccents();
    const premier = relire(id);
    fixDegatsAccents();
    const second = relire(id);
    nettoyer(id);
    expect(premier).toContain('passés ensemble');
    expect(second).toBe(premier);
  });
});

describe('Le corpus livre est indemne', () => {
  const corpus = () => db.prepare(
    'SELECT id, text, options, option_a, option_b FROM questions'
  ).all() as {
    id: number; text: string; options: string | null; option_a: string | null; option_b: string | null;
  }[];

  it("aucune question ne porte d'elision fabriquee", () => {
    const coupables = corpus().filter(r =>
      [r.text, r.options, r.option_a, r.option_b]
        .some(v => typeof v === 'string' && DEGAT_ELISION.test(v))
    );
    expect(coupables.map(r => `#${r.id} ${r.text.slice(0, 70)}`)).toEqual([]);
  });

  it("aucune question ne porte d'accent glisse au milieu d'un mot", () => {
    const coupables = corpus().filter(r =>
      [r.text, r.options, r.option_a, r.option_b]
        .some(v => typeof v === 'string' && DEGAT_TRES.test(v))
    );
    expect(coupables.map(r => `#${r.id} ${r.text.slice(0, 70)}`)).toEqual([]);
  });

  it('aucun enonce actif ne figure deux fois dans le meme theme', () => {
    deactivateDuplicateQuestions();
    const doublons = db.prepare(`
      SELECT category, text, COUNT(*) n FROM questions WHERE active = 1
      GROUP BY category, text HAVING n > 1
    `).all() as { category: string; text: string; n: number }[];
    expect(doublons.map(d => `x${d.n} [${d.category}] ${d.text.slice(0, 60)}`)).toEqual([]);
  });

  it('la desactivation des doublons est idempotente', () => {
    deactivateDuplicateQuestions();
    const avant = (db.prepare('SELECT COUNT(*) n FROM questions WHERE active = 1').get() as { n: number }).n;
    deactivateDuplicateQuestions();
    const apres = (db.prepare('SELECT COUNT(*) n FROM questions WHERE active = 1').get() as { n: number }).n;
    expect(apres).toBe(avant);
  });
});
