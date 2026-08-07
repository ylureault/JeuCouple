import { db, initDatabase } from '../database.js';
import * as roomModel from '../models/room.js';
import type { Question, Room, RoomResponse, GameFinishedData, GameRevealData } from '../types.js';
import {
  demarrerServeur, connecter, emettreAvecAck, attendre, enregistrer, pause,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * Fin de partie et purge des reponses.
 *
 * P0 de l'audit croise (coach en relations + cybersecurite) : les reponses
 * libres sont des confessions intimes. Une fois le recapitulatif envoye aux
 * joueurs, plus rien ne justifie de garder ces textes en clair dans SQLite.
 * On joue donc une partie complete, du lancement au podium, et on verifie que
 * la table `answers` de cette partie est vide ensuite.
 */

const PORT = 3148;
let serveur: HarnaisServeur;

const NOMBRE_DE_QUESTIONS = 5;

let hote: ClientSocket;
let invite: ClientSocket;
let salon: Room;
let jetonHote: string;
let gameId: number;
let resultatHote: GameFinishedData;
let resultatInvite: GameFinishedData;
let revelations: GameRevealData[];
let questionsVues: number[] = [];
let reponsesEnBasePendantLaPartie = 0;

beforeAll(async () => {
  initDatabase();
  serveur = await demarrerServeur(PORT);

  hote = await connecter(serveur);
  const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create', {
    playerName: 'Alice', gender: 'F',
    questionCount: NOMBRE_DE_QUESTIONS, categories: ['culture'], questionTypes: ['H'],
  });
  salon = creation.room!;
  jetonHote = creation.sessionToken!;

  invite = await connecter(serveur);
  await emettreAvecAck<RoomResponse>(invite, 'room:join',
    { code: salon.code, playerName: 'Bob', gender: 'M' });
  invite.emit('room:accept-settings');
  await pause(200);

  revelations = enregistrer<GameRevealData>(hote, 'game:reveal');

  // Les deux joueurs repondent des qu'une question arrive.
  hote.on('game:question', (donnees: { question: Question }) => {
    questionsVues.push(donnees.question.id);
    hote.emit('game:answer', { answer: donnees.question.options?.[0] ?? 'A' });
    invite.emit('game:answer', { answer: donnees.question.options?.[0] ?? 'A' });
  });

  const attenteDemarrage = attendre<{ gameId: number }>(hote, 'game:started', 10_000);
  const finHote = attendre<GameFinishedData>(hote, 'game:finished', 110_000);
  const finInvite = attendre<GameFinishedData>(invite, 'game:finished', 110_000);
  await emettreAvecAck<{ success: boolean }>(hote, 'game:start');
  gameId = (await attenteDemarrage).gameId;

  // Photographie de la base AVANT la fin de partie : les reponses y sont bien.
  await pause(3000);
  reponsesEnBasePendantLaPartie =
    (db.prepare('SELECT COUNT(*) c FROM answers WHERE game_id = ?').get(gameId) as { c: number }).c;

  [resultatHote, resultatInvite] = await Promise.all([finHote, finInvite]);
}, 150_000);

afterAll(async () => {
  await serveur.fermer();
});

describe('Deroulement complet d\'une partie classique', () => {
  it('sert le nombre de questions annonce', () => {
    expect(questionsVues.length).toBe(NOMBRE_DE_QUESTIONS);
  });

  it('ne rejoue jamais deux fois la meme question', () => {
    expect(new Set(questionsVues).size).toBe(questionsVues.length);
  });

  it('revele chaque manche', () => {
    expect(revelations.length).toBe(NOMBRE_DE_QUESTIONS);
  });

  it('les reponses etaient bien enregistrees pendant la partie', () => {
    expect(reponsesEnBasePendantLaPartie).toBeGreaterThan(0);
  });
});

describe('Recapitulatif de fin de partie', () => {
  it('parvient a l\'hote', () => {
    expect(resultatHote).toBeDefined();
  });

  it('parvient au partenaire', () => {
    expect(resultatInvite).toBeDefined();
  });

  it('annonce les memes scores aux deux joueurs', () => {
    expect([resultatHote.score1, resultatHote.score2])
      .toEqual([resultatInvite.score1, resultatInvite.score2]);
  });

  it('annonce le nombre de questions jouees', () => {
    expect(resultatHote.totalQuestions).toBe(NOMBRE_DE_QUESTIONS);
  });

  it('les scores correspondent a la somme des points reveles', () => {
    const somme1 = revelations.reduce((total, r) => total + r.points1, 0);
    const somme2 = revelations.reduce((total, r) => total + r.points2, 0);
    expect([resultatHote.score1, resultatHote.score2]).toEqual([somme1, somme2]);
  });

  it('designe un gagnant ou une egalite', () => {
    expect([1, 2, 'tie']).toContain(resultatHote.winner);
  });

  it('le gagnant annonce est coherent avec les scores', () => {
    const { score1, score2, winner } = resultatHote;
    if (score1 > score2) expect(winner).toBe(1);
    else if (score2 > score1) expect(winner).toBe(2);
    else expect([1, 2, 'tie']).toContain(winner);
  });

  it('joint l\'historique complet des manches', () => {
    expect(resultatHote.questionHistory).toHaveLength(NOMBRE_DE_QUESTIONS);
  });

  it('chaque manche de l\'historique porte sa question et les deux reponses', () => {
    for (const manche of resultatHote.questionHistory!) {
      expect(manche.question.id).toBeGreaterThan(0);
      expect(typeof manche.answer1).toBe('string');
      expect(typeof manche.answer2).toBe('string');
    }
  });

  it('joint une ventilation par theme', () => {
    expect(resultatHote.categoryScores.length).toBeGreaterThan(0);
  });

  it('la compatibilite par theme reste dans une plage lisible', () => {
    for (const score of resultatHote.categoryScores) {
      expect(score.compatibility).toBeGreaterThanOrEqual(-100);
      expect(score.compatibility).toBeLessThanOrEqual(100);
      expect(score.questionsAnswered).toBeGreaterThan(0);
    }
  });

  it('le total des questions ventilees par theme egale le nombre de manches', () => {
    const total = resultatHote.categoryScores.reduce((n, s) => n + s.questionsAnswered, 0);
    expect(total).toBe(NOMBRE_DE_QUESTIONS);
  });

  it('joint les series maximales des deux joueurs', () => {
    expect(resultatHote.maxStreak1).toBeGreaterThanOrEqual(0);
    expect(resultatHote.maxStreak2).toBeGreaterThanOrEqual(0);
  });

  it('joint le total des bonus de rapidite', () => {
    expect(typeof resultatHote.speedBonusTotal1).toBe('number');
    expect(typeof resultatHote.speedBonusTotal2).toBe('number');
  });

  it('compte les accords parfaits', () => {
    expect(resultatHote.perfectMatches).toBeGreaterThanOrEqual(0);
  });

  it('compte les bonnes reponses de chaque joueur', () => {
    expect(resultatHote.correctAnswers1).toBeLessThanOrEqual(NOMBRE_DE_QUESTIONS);
    expect(resultatHote.correctAnswers2).toBeLessThanOrEqual(NOMBRE_DE_QUESTIONS);
  });
});

describe('Purge des reponses intimes en fin de partie', () => {
  it('ne conserve aucune reponse de la partie en base', () => {
    const restantes = db.prepare('SELECT COUNT(*) c FROM answers WHERE game_id = ?')
      .get(gameId) as { c: number };
    expect(restantes.c).toBe(0);
  });

  it('purge alors que des reponses avaient bien ete ecrites', () => {
    // Sans cette garantie, le test precedent passerait meme si rien n'avait
    // jamais ete enregistre.
    expect(reponsesEnBasePendantLaPartie).toBeGreaterThanOrEqual(2);
  });

  it('l\'historique reste disponible dans le recapitulatif envoye aux joueurs', () => {
    expect(resultatHote.questionHistory!.every(m => m.answer1 !== null)).toBe(true);
  });

  it('marque la partie comme terminee en base', () => {
    const partie = db.prepare('SELECT finished_at FROM games WHERE id = ?')
      .get(gameId) as { finished_at: string | null };
    expect(partie.finished_at).not.toBeNull();
  });

  it('enregistre les scores finaux en base', () => {
    const partie = db.prepare('SELECT score_player1, score_player2 FROM games WHERE id = ?')
      .get(gameId) as { score_player1: number; score_player2: number };
    expect([partie.score_player1, partie.score_player2])
      .toEqual([resultatHote.score1, resultatHote.score2]);
  });

  it('replace le salon en statut « finished »', () => {
    expect(roomModel.getRoomByCode(salon.code)?.status).toBe('finished');
  });

  it('refuse toute reconnexion a la partie terminee, meme avec un jeton valide', async () => {
    const revenant = await connecter(serveur);
    const rep = await emettreAvecAck<RoomResponse>(revenant, 'room:reconnect', {
      code: salon.code, playerId: 1, sessionToken: jetonHote,
    });
    expect(rep.success).toBe(false);
    expect(rep.error).toBe('Game already finished');
  });

  it('n\'accepte plus de reponse une fois la partie close', async () => {
    const ack = await emettreAvecAck<{ accepted: boolean; error?: string }>(
      hote, 'game:answer', { answer: 'encore une' });
    expect(ack.accepted).toBe(false);
  });
});
