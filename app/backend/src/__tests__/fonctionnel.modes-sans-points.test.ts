import { db, initDatabase } from '../database.js';
import { GAME_MODES } from '../types.js';
import type { Question, Room, RoomResponse, GameRevealData, RoundState } from '../types.js';
import { listGameModes, isScorelessMode } from '../services/gameModes.js';
import {
  demarrerServeur, connecter, emettreAvecAck, attendre, pause,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * Deux bugs de la section 6 de docs/LIVRAISON.md, verifies contre le VRAI
 * serveur et de vrais clients socket.io :
 *
 *  1. Les modes « sans points » marquaient des points : `envies` affichait
 *     253/250 en trois manches alors que le catalogue annonce l'absence de
 *     score. Le bareme tournait sans regarder le drapeau `scoreless`.
 *  2. Une question rejouee bloquait la manche : les reponses etant indexees par
 *     `question.id`, une question qui revenait (vivier epuise) refusait les
 *     nouvelles reponses (« Reponse deja enregistree ») et rejouait l'ancien
 *     resultat au chrono.
 *
 * La base de cette suite est ramenee a UNE SEULE question active : le vivier
 * est donc epuise des la deuxieme manche, ce qui reproduit exactement le cas 2.
 */

const PORT = 3161;
let serveur: HarnaisServeur;
let questionUnique: number;

interface Ack { accepted: boolean; error?: string }
interface Partie { hote: ClientSocket; invite: ClientSocket; salon: Room; question: Question }

beforeAll(async () => {
  initDatabase();
  const q = db.prepare("SELECT id FROM questions WHERE active = 1 ORDER BY id LIMIT 1")
    .get() as { id: number };
  questionUnique = q.id;
  db.prepare('UPDATE questions SET active = 0 WHERE id != ?').run(questionUnique);
  serveur = await demarrerServeur(PORT);
}, 30_000);

afterAll(async () => {
  await serveur.fermer();
});

async function lancerPartie(gameMode: string): Promise<Partie> {
  const hote = await connecter(serveur);
  const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create', {
    playerName: 'Alice', gender: 'F',
    questionCount: 5, categories: [], questionTypes: [], gameMode,
  });
  const invite = await connecter(serveur);
  await emettreAvecAck<RoomResponse>(invite, 'room:join',
    { code: creation.room!.code, playerName: 'Bob', gender: 'M' });
  invite.emit('room:accept-settings');
  await pause(200);

  const attenteQuestion = attendre<{ question: Question }>(hote, 'game:question', 10_000);
  await emettreAvecAck<{ success: boolean }>(hote, 'game:start');
  const { question } = await attenteQuestion;
  return { hote, invite, salon: creation.room!, question };
}

describe('Registre et catalogue s\'accordent sur les modes sans points', () => {
  for (const mode of listGameModes()) {
    it(`le mode « ${mode.id} » declare le meme scoreless des deux cotes`, () => {
      const catalogue = GAME_MODES.find(m => m.id === mode.id);
      // Un mode absent du catalogue client n'est pas l'objet de ce test.
      if (!catalogue) return;
      expect(mode.scoreless === true).toBe(catalogue.scoreless === true);
    });
  }

  it('reconnait envies et petits noms comme modes sans points', () => {
    expect(isScorelessMode('envies')).toBe(true);
    expect(isScorelessMode('petits_noms')).toBe(true);
  });

  it('ne prend aucun autre mode pour un mode sans points', () => {
    for (const id of ['classic', 'duel', 'escalade', 'complices', 'sudden_death', 'inverse', 'mix', 'quiz_express']) {
      expect(isScorelessMode(id)).toBe(false);
    }
  });

  it('traite un mode inconnu comme un mode a points (repli classique)', () => {
    expect(isScorelessMode('mode_inexistant')).toBe(false);
    expect(isScorelessMode(undefined)).toBe(false);
  });
});

describe('Mode « envies » : trois manches jouees, aucun point', () => {
  const idsServis: number[] = [];
  const acks: Ack[] = [];
  const revelations: GameRevealData[] = [];
  const delaisRevelation: number[] = [];
  let dernierEtat: RoundState;

  beforeAll(async () => {
    const partie = await lancerPartie('envies');
    partie.hote.on('game:round-state', (e: RoundState) => { dernierEtat = e; });

    let question = partie.question;
    for (let manche = 1; manche <= 3; manche++) {
      idsServis.push(question.id);
      const attenteRevelation = attendre<GameRevealData>(partie.hote, 'game:reveal', 25_000);
      acks.push(await emettreAvecAck<Ack>(partie.hote, 'game:answer', { answer: 'oui' }));
      const debut = Date.now();
      acks.push(await emettreAvecAck<Ack>(partie.invite, 'game:answer', { answer: 'oui' }));
      revelations.push(await attenteRevelation);
      delaisRevelation.push(Date.now() - debut);
      if (manche < 3) {
        question = (await attendre<{ question: Question }>(partie.hote, 'game:question', 25_000)).question;
      }
    }
    await pause(300);
    partie.hote.disconnect();
    partie.invite.disconnect();
  }, 90_000);

  it('joue bien trois manches', () => {
    expect(revelations).toHaveLength(3);
  });

  it('ne credite aucun point de base', () => {
    expect(revelations.map(r => r.basePoints)).toEqual([0, 0, 0]);
  });

  it('ne credite aucun point aux joueurs', () => {
    expect(revelations.map(r => [r.points1, r.points2])).toEqual([[0, 0], [0, 0], [0, 0]]);
  });

  it('ne credite aucun bonus de rapidite', () => {
    expect(revelations.map(r => [r.speedBonus1, r.speedBonus2])).toEqual([[0, 0], [0, 0], [0, 0]]);
  });

  it('ne credite aucun bonus de serie', () => {
    expect(revelations.map(r => [r.streakBonus1, r.streakBonus2])).toEqual([[0, 0], [0, 0], [0, 0]]);
  });

  it('n\'affiche aucune serie en cours', () => {
    expect(revelations.map(r => [r.streak1, r.streak2])).toEqual([[0, 0], [0, 0], [0, 0]]);
  });

  it('laisse les deux scores a zero apres trois manches', () => {
    // C'est le chiffre de la recette : 253/250 avant correction.
    expect(dernierEtat.scores).toEqual({ player1: 0, player2: 0 });
  });
});

describe('Une question rejouee accepte de nouvelles reponses', () => {
  const idsServis: number[] = [];
  const acks: Ack[] = [];
  const delais: number[] = [];

  beforeAll(async () => {
    const partie = await lancerPartie('envies');
    let question = partie.question;
    for (let manche = 1; manche <= 3; manche++) {
      idsServis.push(question.id);
      const attenteRevelation = attendre<GameRevealData>(partie.hote, 'game:reveal', 25_000);
      acks.push(await emettreAvecAck<Ack>(partie.hote, 'game:answer', { answer: `reponse ${manche} A` }));
      const debut = Date.now();
      acks.push(await emettreAvecAck<Ack>(partie.invite, 'game:answer', { answer: `reponse ${manche} B` }));
      await attenteRevelation;
      delais.push(Date.now() - debut);
      if (manche < 3) {
        question = (await attendre<{ question: Question }>(partie.hote, 'game:question', 25_000)).question;
      }
    }
    await pause(300);
    partie.hote.disconnect();
    partie.invite.disconnect();
  }, 90_000);

  it('resert la meme question, le vivier etant epuise', () => {
    expect(new Set(idsServis).size).toBe(1);
    expect(idsServis[0]).toBe(questionUnique);
  });

  it('accepte les six reponses, y compris aux manches deux et trois', () => {
    expect(acks).toEqual(Array(6).fill({ accepted: true }));
  });

  it('ne repond jamais « Reponse deja enregistree » a une nouvelle manche', () => {
    expect(acks.filter(a => a.error === 'Reponse deja enregistree')).toEqual([]);
  });

  it('revele des que les deux ont repondu, sans attendre le chrono', () => {
    // Avant correction, la manche rejouee se revelait seule a l'expiration du
    // minuteur (plus de dix secondes) en rejouant l'ancien resultat.
    for (const d of delais) expect(d).toBeLessThan(3000);
  });
});

describe('Un mode a points continue de marquer', () => {
  let revelation: GameRevealData;

  beforeAll(async () => {
    const partie = await lancerPartie('classic');
    const attenteRevelation = attendre<GameRevealData>(partie.hote, 'game:reveal', 25_000);
    await emettreAvecAck<Ack>(partie.hote, 'game:answer', { answer: 'oui' });
    await emettreAvecAck<Ack>(partie.invite, 'game:answer', { answer: 'oui' });
    revelation = await attenteRevelation;
    await pause(300);
    partie.hote.disconnect();
    partie.invite.disconnect();
  }, 60_000);

  it('credite les deux joueurs quand ils tombent d\'accord', () => {
    expect(revelation.points1).toBeGreaterThan(0);
    expect(revelation.points2).toBeGreaterThan(0);
  });
});
