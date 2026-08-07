import { db, initDatabase, fixTypeNReferenceValues } from '../database.js';
import * as questionModel from '../models/question.js';

/**
 * Type N (Plus/Moins) — le type etait MORT.
 *
 * `isPlayable()` exige un `reference_value`, mais la colonne n'existait pas
 * dans la table questions : aucune question N ne sortait jamais au tirage, et
 * rien ne le signalait. Ces tests verrouillent les trois maillons de la chaine
 * — la colonne, le remplissage des lignes deja en base, et le tirage.
 */

beforeAll(() => {
  initDatabase();
});

describe('Colonne reference_value', () => {
  const colonnes = () =>
    (db.prepare('PRAGMA table_info(questions)').all() as { name: string }[]).map(c => c.name);

  it('existe dans la table questions', () => {
    expect(colonnes()).toContain('reference_value');
  });

  it('accepte un nombre et le relit tel quel', () => {
    const id = db.prepare(
      "INSERT INTO questions (type, category, text, reference_value, timer, active) VALUES ('N','fun',?,?,10,1)"
    ).run(`Plus ou moins de 42 tests ? ${Math.random()}`, 42).lastInsertRowid as number;
    expect(questionModel.getQuestionById(id)?.reference_value).toBe(42);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('remonte jusqu\'au modele, meme quand la reference vaut zero', () => {
    // Piege classique : `row.reference_value || undefined` effacerait le zero.
    const id = db.prepare(
      "INSERT INTO questions (type, category, text, reference_value, timer, active) VALUES ('N','fun',?,0,10,1)"
    ).run(`Plus ou moins de 0 chose ? ${Math.random()}`).lastInsertRowid as number;
    expect(questionModel.getQuestionById(id)?.reference_value).toBe(0);
    expect(questionModel.isPlayable(questionModel.getQuestionById(id)!)).toBe(true);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });
});

describe('fixTypeNReferenceValues — reparer les lignes deja en base', () => {
  it('recopie le nombre de l\'enonce dans la colonne', () => {
    const id = db.prepare(
      "INSERT INTO questions (type, category, text, timer, active) VALUES ('N','fun',?,10,1)"
    ).run(`Tu dors plus ou moins de 9 heures par nuit ? ${Math.random()}`).lastInsertRowid as number;
    fixTypeNReferenceValues();
    expect(questionModel.getQuestionById(id)?.reference_value).toBe(9);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('desactive une question Plus/Moins sans aucun nombre (inrepondable)', () => {
    const id = db.prepare(
      "INSERT INTO questions (type, category, text, timer, active) VALUES ('N','fun',?,10,1)"
    ).run(`Plus ou moins que la moyenne ? ${Math.random()}`.replace(/[0-9.]/g, '')).lastInsertRowid as number;
    fixTypeNReferenceValues();
    const ligne = db.prepare('SELECT active, reference_value FROM questions WHERE id = ?').get(id) as
      { active: number; reference_value: number | null };
    expect(ligne).toEqual({ active: 0, reference_value: null });
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('ne touche pas a une reference deja renseignee (idempotence)', () => {
    const id = db.prepare(
      "INSERT INTO questions (type, category, text, reference_value, timer, active) VALUES ('N','fun',?,3,10,1)"
    ).run(`Tu bois plus ou moins de 7 verres ? ${Math.random()}`).lastInsertRowid as number;
    fixTypeNReferenceValues();
    fixTypeNReferenceValues();
    expect(questionModel.getQuestionById(id)?.reference_value).toBe(3);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });
});

describe('Le type N est de nouveau jouable', () => {
  it('le catalogue de base porte des questions N actives', () => {
    const actives = db.prepare(
      "SELECT COUNT(*) AS c FROM questions WHERE type = 'N' AND active = 1"
    ).get() as { c: number };
    expect(actives.c).toBeGreaterThan(0);
  });

  it('aucune question N active ne reste sans nombre de reference', () => {
    const orphelines = db.prepare(
      "SELECT id, text FROM questions WHERE type = 'N' AND active = 1 AND reference_value IS NULL"
    ).all();
    expect(orphelines).toEqual([]);
  });

  it('le tirage sert effectivement des questions de type N', () => {
    const tirage = questionModel.getMixedQuestions(4, [], ['N']);
    expect(tirage.length).toBeGreaterThan(0);
    expect(tirage.every(q => q.type === 'N')).toBe(true);
  });

  it('toutes les questions N tirees passent isPlayable', () => {
    const tirage = questionModel.getMixedQuestions(4, [], ['N']);
    expect(tirage.every(questionModel.isPlayable)).toBe(true);
  });

  it('affiche le nombre de reference dans l\'enonce, faute de rendu dedie', () => {
    // Le client dessine deux boutons PLUS / MOINS mais n'ecrit nulle part la
    // valeur de reference : elle DOIT donc rester lisible dans le texte, sinon
    // la question devient « plus ou moins que quoi ? ».
    const muettes = questionModel.getMixedQuestions(20, [], ['N'])
      .filter(q => !q.text.includes(String(q.reference_value)))
      .map(q => q.text);
    expect(muettes).toEqual([]);
  });
});
