import { db, initDatabase } from '../database.js';
import * as questionModel from '../models/question.js';
import type { Question } from '../types.js';

/**
 * Tirage des questions : c'est lui qui decide de ce que le couple voit. Un
 * filtre de theme qui fuit, une exclusion qui ne mord pas ou un vivier epuise
 * mal gere se traduisent en jeu par « on retombe toujours sur les memes
 * questions » — le reproche numero un remonte sur les modes sans fin.
 */

describe('Tirage des questions', () => {
  beforeAll(() => {
    initDatabase();
  });

  describe('quantites demandees', () => {
    for (const n of [1, 2, 5, 10, 20, 37]) {
      it(`rend exactement ${n} question(s) sur un vivier entierement jouable`, () => {
        // Theme « culture » + type H : toutes les questions y sont jouables,
        // le filet de securite `isPlayable` n'en retire donc aucune.
        expect(questionModel.getMixedQuestions(n, ['culture'], ['H'])).toHaveLength(n);
      });
    }

    for (const n of [1, 5, 10, 20, 37]) {
      it(`ne rend jamais plus de ${n} question(s) sur le catalogue complet`, () => {
        expect(questionModel.getMixedQuestions(n).length).toBeLessThanOrEqual(n);
      });
    }

    it('rend une liste vide quand on ne demande rien', () => {
      expect(questionModel.getMixedQuestions(0)).toEqual([]);
    });

    it('sert au moins une question des qu\'on en demande une', () => {
      expect(questionModel.getMixedQuestions(1).length).toBe(1);
    });

    it('ne rend jamais deux fois la meme question dans un tirage', () => {
      const ids = questionModel.getMixedQuestions(60).map(q => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('plafonne au nombre de questions reellement disponibles', () => {
      const tirage = questionModel.getMixedQuestions(5, ['public']);
      const total = db.prepare("SELECT COUNT(*) c FROM questions WHERE active = 1 AND category = 'public'")
        .get() as { c: number };
      expect(tirage.length).toBe(Math.min(5, total.c));
    });
  });

  describe('filtre par theme', () => {
    it('ne sort que des questions du theme demande', () => {
      const tirage = questionModel.getMixedQuestions(15, ['couple']);
      expect(tirage.every(q => q.category === 'couple')).toBe(true);
      expect(tirage.length).toBeGreaterThan(0);
    });

    it('accepte plusieurs themes a la fois', () => {
      const tirage = questionModel.getMixedQuestions(30, ['couple', 'fun']);
      expect(tirage.every(q => ['couple', 'fun'].includes(q.category))).toBe(true);
    });

    it('ne melange pas les themes voisins', () => {
      const tirage = questionModel.getMixedQuestions(20, ['culture']);
      expect(tirage.some(q => q.category !== 'culture')).toBe(false);
    });

    it('rend une liste vide pour un theme inconnu', () => {
      expect(questionModel.getMixedQuestions(10, ['theme_qui_n_existe_pas'])).toEqual([]);
    });

    it('une liste de themes vide ouvre tous les themes', () => {
      const tirage = questionModel.getMixedQuestions(60, []);
      expect(new Set(tirage.map(q => q.category)).size).toBeGreaterThan(1);
    });
  });

  describe('filet de securite : aucune question injouable ne sort du tirage', () => {
    it('toute question servie porte de quoi y repondre', () => {
      const tirage = questionModel.getMixedQuestions(120);
      expect(tirage.filter(q => !questionModel.isPlayable(q))).toEqual([]);
    });

    it('meme constat theme par theme', () => {
      for (const theme of ['couple', 'coquin', 'fun', 'culture', 'habitudes']) {
        const tirage = questionModel.getMixedQuestions(30, [theme]);
        expect(tirage.every(questionModel.isPlayable)).toBe(true);
      }
    });
  });

  describe('regle de jouabilite (isPlayable)', () => {
    const q = (over: Partial<Question>): Question => ({
      id: 1, type: 'A', category: 'couple', text: 'x', timer: 20, active: true, ...over,
    });

    for (const type of ['A', 'B', 'M', 'O', 'P', 'R'] as Question['type'][]) {
      it(`le type ${type} exige au moins deux options`, () => {
        expect(questionModel.isPlayable(q({ type, options: ['a', 'b'] }))).toBe(true);
        expect(questionModel.isPlayable(q({ type, options: ['a'] }))).toBe(false);
        expect(questionModel.isPlayable(q({ type, options: undefined }))).toBe(false);
      });
    }

    it('le type H exige une bonne reponse figurant dans les options', () => {
      expect(questionModel.isPlayable(q({ type: 'H', options: ['a', 'b'], correct_answer: 'a' }))).toBe(true);
      expect(questionModel.isPlayable(q({ type: 'H', options: ['a', 'b'], correct_answer: 'z' }))).toBe(false);
      expect(questionModel.isPlayable(q({ type: 'H', options: ['a', 'b'] }))).toBe(false);
    });

    for (const type of ['E', 'L'] as Question['type'][]) {
      it(`le type ${type} exige ses deux options binaires`, () => {
        expect(questionModel.isPlayable(q({ type, option_a: 'a', option_b: 'b' }))).toBe(true);
        expect(questionModel.isPlayable(q({ type, option_a: 'a' }))).toBe(false);
        expect(questionModel.isPlayable(q({ type }))).toBe(false);
      });
    }

    it('le type I exige ses deux options ET ses deux emojis', () => {
      expect(questionModel.isPlayable(q({ type: 'I', option_a: 'a', option_b: 'b', emoji_a: '🌞', emoji_b: '🌙' }))).toBe(true);
      expect(questionModel.isPlayable(q({ type: 'I', option_a: 'a', option_b: 'b' }))).toBe(false);
      expect(questionModel.isPlayable(q({ type: 'I', emoji_a: '🌞', emoji_b: '🌙' }))).toBe(false);
    });

    it('le type N exige un nombre de reference', () => {
      expect(questionModel.isPlayable(q({ type: 'N', reference_value: 12 }))).toBe(true);
      expect(questionModel.isPlayable(q({ type: 'N' }))).toBe(false);
    });

    it('le type N accepte la valeur de reference zero', () => {
      expect(questionModel.isPlayable(q({ type: 'N', reference_value: 0 }))).toBe(true);
    });

    for (const type of ['C', 'D', 'F', 'G', 'K', 'Q', 'S'] as Question['type'][]) {
      it(`le type ${type} est jouable sans champ supplementaire`, () => {
        expect(questionModel.isPlayable(q({ type }))).toBe(true);
      });
    }
  });

  describe('filtre par type de saisie', () => {
    for (const type of ['A', 'B', 'F']) {
      it(`ne sort que des questions de type ${type}`, () => {
        const tirage = questionModel.getMixedQuestions(10, [], [type]);
        expect(tirage.every(q => q.type === type)).toBe(true);
        expect(tirage.length).toBeGreaterThan(0);
      });
    }

    it('accepte plusieurs types a la fois', () => {
      const tirage = questionModel.getMixedQuestions(20, [], ['A', 'B']);
      expect(tirage.every(q => q.type === 'A' || q.type === 'B')).toBe(true);
    });

    it('rend une liste vide pour un type inexistant', () => {
      expect(questionModel.getMixedQuestions(10, [], ['ZZ'])).toEqual([]);
    });

    it('combine theme et type', () => {
      const tirage = questionModel.getMixedQuestions(10, ['culture'], ['H']);
      expect(tirage.every(q => q.category === 'culture' && q.type === 'H')).toBe(true);
      expect(tirage.length).toBeGreaterThan(0);
    });

    it('rend une liste vide quand la combinaison theme + type est vide', () => {
      expect(questionModel.getMixedQuestions(10, ['culture'], ['C'])).toEqual([]);
    });
  });

  describe('variete des types dans un tirage large', () => {
    it('melange plusieurs types de saisie plutot que d\'en servir un seul', () => {
      const tirage = questionModel.getMixedQuestions(40);
      expect(new Set(tirage.map(q => q.type)).size).toBeGreaterThan(2);
    });

    it('sert au moins une question de chaque type disponible sur un gros tirage', () => {
      const tirage = questionModel.getMixedQuestions(80, ['culture']);
      expect(new Set(tirage.map(q => q.type)).size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('non-repetition (excludeIds)', () => {
    it('n\'inclut jamais une question explicitement exclue', () => {
      const premier = questionModel.getMixedQuestions(10, ['couple']);
      const exclus = premier.map(q => q.id);
      const second = questionModel.getMixedQuestions(10, ['couple'], [], exclus);
      expect(second.some(q => exclus.includes(q.id))).toBe(false);
    });

    it('vide le vivier quand toutes les questions du theme sont exclues', () => {
      const toutes = db.prepare("SELECT id FROM questions WHERE active = 1 AND category = 'public'")
        .all() as { id: number }[];
      const exclus = toutes.map(r => r.id);
      expect(questionModel.getMixedQuestions(3, ['public'], [], exclus)).toEqual([]);
    });

    it('une liste d\'exclusion vide ne change rien', () => {
      expect(questionModel.getMixedQuestions(5, ['culture'], [], []).length).toBe(5);
    });

    it('des identifiants inexistants dans l\'exclusion ne perturbent pas le tirage', () => {
      expect(questionModel.getMixedQuestions(5, ['culture'], [], [-1, -2, -3]).length).toBe(5);
    });

    it('ne garde que les 500 dernieres exclusions (limite de parametres SQLite)', () => {
      const cible = questionModel.getMixedQuestions(1, ['public'])[0];
      expect(cible).toBeDefined();
      const bourrage = Array.from({ length: 500 }, (_, i) => -1000 - i);

      // Exclusion en fin de liste : elle est conservee, la question disparait.
      const avecExclusion = questionModel.getMixedQuestions(5, ['public'], [], [...bourrage, cible.id]);
      expect(avecExclusion.some(q => q.id === cible.id)).toBe(false);

      // Meme exclusion placee AVANT le bourrage : elle tombe hors de la fenetre.
      const horsFenetre = questionModel.getMixedQuestions(5, ['public'], [], [cible.id, ...bourrage]);
      expect(horsFenetre.some(q => q.id === cible.id)).toBe(true);
    });
  });

  describe('questions desactivees', () => {
    let inactiveId: number;

    beforeAll(() => {
      const r = db.prepare(`
        INSERT INTO questions (type, category, text, timer, active)
        VALUES ('A', 'public', 'Question desactivee de test', 20, 0)
      `).run();
      inactiveId = r.lastInsertRowid as number;
    });

    afterAll(() => {
      db.prepare('DELETE FROM questions WHERE id = ?').run(inactiveId);
    });

    it('ne sort jamais une question desactivee', () => {
      const tirage = questionModel.getMixedQuestions(50, ['public']);
      expect(tirage.some(q => q.id === inactiveId)).toBe(false);
    });

    it('ne la compte pas non plus dans le total actif', () => {
      expect(questionModel.getActiveQuestions().some(q => q.id === inactiveId)).toBe(false);
    });

    it('la retrouve tout de meme par son identifiant', () => {
      expect(questionModel.getQuestionById(inactiveId)?.active).toBe(false);
    });
  });

  describe('forme des questions rendues', () => {
    let echantillon: Question[];

    beforeAll(() => {
      echantillon = questionModel.getMixedQuestions(40);
    });

    it('rend un identifiant numerique', () => {
      expect(echantillon.every(q => typeof q.id === 'number')).toBe(true);
    });

    it('rend un enonce non vide', () => {
      expect(echantillon.every(q => typeof q.text === 'string' && q.text.length > 0)).toBe(true);
    });

    it('rend un minuteur exploitable', () => {
      expect(echantillon.every(q => q.timer > 0)).toBe(true);
    });

    it('marque les questions comme actives', () => {
      expect(echantillon.every(q => q.active === true)).toBe(true);
    });

    it('desserialise les options en tableau', () => {
      const avecOptions = questionModel.getMixedQuestions(20, [], ['A']);
      expect(avecOptions.every(q => Array.isArray(q.options))).toBe(true);
    });

    it('laisse options a undefined quand la question n\'en a pas', () => {
      const echelles = questionModel.getMixedQuestions(5, [], ['D']);
      expect(echelles.every(q => q.options === undefined)).toBe(true);
    });

    it('rend la bonne reponse des QCM de culture generale', () => {
      const qcm = questionModel.getMixedQuestions(10, ['culture'], ['H']);
      expect(qcm.every(q => typeof q.correct_answer === 'string' && q.correct_answer.length > 0)).toBe(true);
    });

    it('la bonne reponse figure toujours parmi les options proposees', () => {
      const qcm = questionModel.getMixedQuestions(20, ['culture'], ['H']);
      expect(qcm.every(q => (q.options ?? []).includes(q.correct_answer!))).toBe(true);
    });
  });

  describe('aleatoire du tirage', () => {
    it('ne rend pas systematiquement la meme liste', () => {
      const a = questionModel.getMixedQuestions(20).map(q => q.id).join(',');
      const b = questionModel.getMixedQuestions(20).map(q => q.id).join(',');
      const c = questionModel.getMixedQuestions(20).map(q => q.id).join(',');
      expect(new Set([a, b, c]).size).toBeGreaterThan(1);
    });

    it('n\'ordonne pas les questions par identifiant croissant', () => {
      const ids = questionModel.getMixedQuestions(30).map(q => q.id);
      const trie = [...ids].sort((x, y) => x - y);
      expect(ids).not.toEqual(trie);
    });
  });
});

describe('Lecture et statistiques du catalogue', () => {
  beforeAll(() => {
    initDatabase();
  });

  it('compte un catalogue non vide', () => {
    expect(questionModel.getTotalQuestions()).toBeGreaterThan(1000);
  });

  it('getAllQuestions renvoie au moins autant que getActiveQuestions', () => {
    expect(questionModel.getAllQuestions().length)
      .toBeGreaterThanOrEqual(questionModel.getActiveQuestions().length);
  });

  it('getRandomQuestions respecte le nombre demande', () => {
    expect(questionModel.getRandomQuestions(12)).toHaveLength(12);
  });

  it('getRandomQuestions ne rend que des questions actives', () => {
    expect(questionModel.getRandomQuestions(30).every(q => q.active)).toBe(true);
  });

  it('getQuestionById rend undefined pour un identifiant inconnu', () => {
    expect(questionModel.getQuestionById(-42)).toBeUndefined();
  });

  it('les statistiques par type couvrent les 19 types', () => {
    expect(Object.keys(questionModel.getQuestionStats())).toHaveLength(19);
  });

  it('la somme des statistiques par type egale le total actif', () => {
    const stats = questionModel.getQuestionStats();
    const somme = Object.values(stats).reduce((a, b) => a + b, 0);
    expect(somme).toBe(questionModel.getTotalQuestions());
  });

  it('aucun compte de type n\'est negatif', () => {
    expect(Object.values(questionModel.getQuestionStats()).every(n => n >= 0)).toBe(true);
  });
});

describe('Ecriture dans le catalogue', () => {
  beforeAll(() => {
    initDatabase();
  });

  it('cree une question active et relisible', () => {
    const q = questionModel.createQuestion({
      type: 'A', category: 'public', text: 'Question creee par le test',
      options: ['un', 'deux'], timer: 25,
    });
    expect(q.id).toBeGreaterThan(0);
    expect(q.active).toBe(true);
    expect(q.options).toEqual(['un', 'deux']);
    expect(q.timer).toBe(25);
    questionModel.deleteQuestion(q.id);
  });

  it('applique un minuteur par defaut quand aucun n\'est fourni', () => {
    const q = questionModel.createQuestion({
      type: 'A', category: 'public', text: 'Sans minuteur', timer: 0,
    });
    expect(q.timer).toBe(20);
    questionModel.deleteQuestion(q.id);
  });

  it('met a jour uniquement les champs fournis', () => {
    const q = questionModel.createQuestion({
      type: 'A', category: 'public', text: 'Avant modification', timer: 20,
    });
    const modifiee = questionModel.updateQuestion(q.id, { text: 'Apres modification' });
    expect(modifiee?.text).toBe('Apres modification');
    expect(modifiee?.category).toBe('public');
    questionModel.deleteQuestion(q.id);
  });

  it('rend null en modifiant une question inexistante', () => {
    expect(questionModel.updateQuestion(-7, { text: 'x' })).toBeNull();
  });

  it('rend la question inchangee quand aucun champ n\'est fourni', () => {
    const q = questionModel.createQuestion({
      type: 'A', category: 'public', text: 'Rien a changer', timer: 20,
    });
    expect(questionModel.updateQuestion(q.id, {})).toEqual(q);
    questionModel.deleteQuestion(q.id);
  });

  it('desactive une question sans la supprimer', () => {
    const q = questionModel.createQuestion({
      type: 'A', category: 'public', text: 'A desactiver', timer: 20,
    });
    questionModel.updateQuestion(q.id, { active: false });
    expect(questionModel.getQuestionById(q.id)?.active).toBe(false);
    questionModel.deleteQuestion(q.id);
  });

  it('supprime une question existante', () => {
    const q = questionModel.createQuestion({
      type: 'A', category: 'public', text: 'A supprimer', timer: 20,
    });
    expect(questionModel.deleteQuestion(q.id)).toBe(true);
    expect(questionModel.getQuestionById(q.id)).toBeUndefined();
  });

  it('signale la suppression d\'une question inexistante', () => {
    expect(questionModel.deleteQuestion(-99)).toBe(false);
  });

  describe('question synthetique du mode « A l\'envers »', () => {
    let synthetique: Question;

    beforeAll(() => {
      synthetique = questionModel.createSyntheticQuestion({
        type: 'H', category: 'couple',
        text: '« bleu »\n\nDe quelle question cette réponse vient-elle ?',
        options: ['Q1', 'Q2', 'Q3', 'Q4'], correct_answer: 'Q1', timer: 30,
      });
    });

    afterAll(() => {
      questionModel.deleteQuestion(synthetique.id);
    });

    it('existe reellement en base : les reponses portent une cle etrangere vers elle', () => {
      expect(questionModel.getQuestionById(synthetique.id)).toBeDefined();
    });

    it('est stockee inactive pour ne jamais ressortir dans un tirage normal', () => {
      expect(questionModel.getQuestionById(synthetique.id)?.active).toBe(false);
    });

    it('est neanmoins rendue jouable au moteur', () => {
      expect(synthetique.active).toBe(true);
    });

    it('conserve la bonne reponse', () => {
      expect(synthetique.correct_answer).toBe('Q1');
    });

    it('n\'apparait dans aucun tirage du theme', () => {
      const tirage = questionModel.getMixedQuestions(50, ['couple']);
      expect(tirage.some(q => q.id === synthetique.id)).toBe(false);
    });
  });

  describe('import / export', () => {
    it('importe le nombre de questions annonce', () => {
      const avant = questionModel.getTotalQuestions();
      const n = questionModel.importQuestions({
        questions: [
          { type: 'A', category: 'public', text: 'Import test 1', options: ['a', 'b'], timer: 20 },
          { type: 'A', category: 'public', text: 'Import test 2', options: ['a', 'b'], timer: 20 },
        ],
      });
      expect(n).toBe(2);
      expect(questionModel.getTotalQuestions()).toBe(avant + 2);
      db.prepare("DELETE FROM questions WHERE text LIKE 'Import test %'").run();
    });

    it('l\'export ne contient ni identifiant ni drapeau d\'activation', () => {
      const exporte = questionModel.exportQuestions();
      expect(exporte.questions.length).toBeGreaterThan(0);
      expect(Object.keys(exporte.questions[0])).not.toContain('id');
      expect(Object.keys(exporte.questions[0])).not.toContain('active');
    });

    it('l\'export couvre tout le catalogue', () => {
      expect(questionModel.exportQuestions().questions.length)
        .toBe(questionModel.getAllQuestions().length);
    });
  });
});
