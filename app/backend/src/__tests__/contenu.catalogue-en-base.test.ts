import { initDatabase } from '../database.js';
import * as questionModel from '../models/question.js';
import * as categoryModel from '../models/category.js';
import * as questionTypeModel from '../models/questionType.js';
import type { Question } from '../types.js';

/**
 * Integrite du catalogue TEL QU'IL EST SERVI AUX JOUEURS.
 *
 * Les tests de `questionData.test.ts` lisent les fichiers `data/`. Ceux-ci
 * verifient la base reellement construite au demarrage : c'est elle que le
 * moteur interroge, et c'est la qu'une question sans option ou rattachee a un
 * theme fantome devient un ecran vide en pleine partie.
 */

describe('Catalogue construit au demarrage', () => {
  let questions: Question[];
  let codesThemes: Set<string>;

  beforeAll(() => {
    initDatabase();
    questions = questionModel.getActiveQuestions();
    codesThemes = new Set(categoryModel.getAllCategories().map(c => c.code));
  });

  const casses = (predicat: (q: Question) => boolean) =>
    questions.filter(predicat).map(q => `#${q.id} [${q.type}/${q.category}] ${q.text.slice(0, 60)}`);

  it('sert un catalogue consequent', () => {
    expect(questions.length).toBeGreaterThan(1500);
  });

  it('rattache chaque question a un theme enregistre', () => {
    expect(casses(q => !codesThemes.has(q.category))).toEqual([]);
  });

  it('ne laisse aucun code de theme historique derriere les migrations', () => {
    const historiques = ['connaissance', 'amour', 'quotidien', 'comportement',
      'sextoys', 'confessions', 'seduction', 'massage', 'anal'];
    expect(casses(q => historiques.includes(q.category))).toEqual([]);
  });

  it('donne au moins deux options aux QCM (types A et B)', () => {
    expect(casses(q => ['A', 'B'].includes(q.type) && (q.options ?? []).length < 2)).toEqual([]);
  });

  it('donne deux libelles aux choix binaires (type E)', () => {
    expect(casses(q => q.type === 'E' && (!q.option_a || !q.option_b))).toEqual([]);
  });

  it('donne deux emojis aux choix visuels (type I)', () => {
    expect(casses(q => q.type === 'I' && (!q.emoji_a || !q.emoji_b))).toEqual([]);
  });

  it('associe aux QCM de culture generale une bonne reponse figurant dans les options', () => {
    expect(casses(q => q.type === 'H' && (!q.correct_answer || !(q.options ?? []).includes(q.correct_answer)))).toEqual([]);
  });

  it('ne propose jamais deux options identiques', () => {
    expect(casses(q => Array.isArray(q.options) && new Set(q.options).size !== q.options.length)).toEqual([]);
  });

  it('donne un minuteur compris entre 5 et 120 secondes', () => {
    expect(casses(q => !(q.timer >= 5 && q.timer <= 120))).toEqual([]);
  });

  it('n\'a aucun enonce vide', () => {
    expect(casses(q => !q.text || q.text.trim().length === 0)).toEqual([]);
  });

  it('n\'a aucun enonce interminable', () => {
    expect(casses(q => q.text.length > 250)).toEqual([]);
  });

  it('n\'utilise que des types de saisie connus du moteur', () => {
    const connus = 'ABCDEFGHIJKLMNOPQRS'.split('');
    expect(casses(q => !connus.includes(q.type))).toEqual([]);
  });

  it('reserve le substitut {player} au type « Vrai ou Faux »', () => {
    expect(casses(q => q.type !== 'G' && /\{player\}/i.test(q.text))).toEqual([]);
  });

  it('propose au moins huit themes reellement peuples', () => {
    const stats = categoryModel.getCategoryStats();
    expect(Object.values(stats).filter(n => n > 0).length).toBeGreaterThanOrEqual(8);
  });

  it('les themes du selecteur pointent vers des questions existantes ou sont vides, jamais l\'inverse', () => {
    const stats = categoryModel.getCategoryStats();
    const fantomes = Object.keys(stats).filter(code => !codesThemes.has(code));
    expect(fantomes).toEqual([]);
  });

  it('chaque theme actif porte un nom, une icone et une couleur', () => {
    const incomplets = categoryModel.getActiveCategories()
      .filter(c => !c.name || !c.icon || !c.color)
      .map(c => c.code);
    expect(incomplets).toEqual([]);
  });

  it('les themes de l\'echelle « Escalade » existent tous', () => {
    const echelle = ['couple', 'souvenirs', 'preliminaires', 'sexy',
      'coquin', 'fantasmes', 'extreme', 'sans_tabou'];
    expect(echelle.filter(code => !codesThemes.has(code))).toEqual([]);
  });

  it('les themes imposes par les modes sans points existent', () => {
    expect(['swipe', 'petits_noms'].filter(code => !codesThemes.has(code))).toEqual([]);
  });

  it('chaque theme a un code unique', () => {
    const codes = categoryModel.getAllCategories().map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('les types de question administrables couvrent les huit types historiques', () => {
    const codes = questionTypeModel.getAllQuestionTypes().map(t => t.code);
    expect(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].filter(c => !codes.includes(c))).toEqual([]);
  });

  it('chaque type administrable declare un mode de scoring et un mode de saisie', () => {
    const incomplets = questionTypeModel.getAllQuestionTypes()
      .filter(t => !t.scoring_mode || !t.input_type)
      .map(t => t.code);
    expect(incomplets).toEqual([]);
  });

  it('le type ouvert (C) n\'est associe a aucun scoring de correspondance', () => {
    expect(questionTypeModel.getScoringModeForType('C')).toBe('none');
  });

  it('le type culture generale (H) est scorie individuellement', () => {
    expect(questionTypeModel.getScoringModeForType('H')).toBe('individual');
  });

  it('le type echelle (D) rend un curseur, pas une liste d\'options', () => {
    expect(questionTypeModel.getInputTypeForType('D')).toBe('scale');
  });

  it('un type inconnu retombe sur un scoring par correspondance', () => {
    expect(questionTypeModel.getScoringModeForType('ZZ')).toBe('match');
  });
});
