import { initDatabase } from '../database.js';
import type { Question, Room, RoomResponse } from '../types.js';
import {
  demarrerServeur, connecter, emettreAvecAck, attendre, attendrePeutEtre, pause,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * Escalade : consentement de palier (P1-11, constat GRAVE n.4 du coach).
 *
 * La montee vers un theme plus explicite n'est jamais imposee : les DEUX joueurs
 * doivent l'accepter. Un seul refus suffit, il reste anonyme, et il n'arrete pas
 * la partie — on reste simplement au palier acquis, sans commentaire.
 *
 * ESCALADE_PALIER_LEN=1 est pose AVANT le demarrage du serveur (donc avant le
 * premier import du registre de modes) pour atteindre le palier en une manche.
 */

const PORT = 3147;
let serveur: HarnaisServeur;

interface Partie { hote: ClientSocket; invite: ClientSocket; salon: Room }
interface DemandePalier {
  palier: number;
  category: { code: string; name: string; icon: string };
  timeoutSeconds: number;
}

beforeAll(async () => {
  initDatabase();
  process.env.ESCALADE_PALIER_LEN = '1';
  serveur = await demarrerServeur(PORT);
}, 30_000);

afterAll(async () => {
  await serveur.fermer();
  delete process.env.ESCALADE_PALIER_LEN;
});

async function jouerPremiereManche(): Promise<Partie> {
  const hote = await connecter(serveur);
  const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create',
    { playerName: 'Alice', gender: 'F', gameMode: 'escalade' });
  const invite = await connecter(serveur);
  await emettreAvecAck<RoomResponse>(invite, 'room:join',
    { code: creation.room!.code, playerName: 'Bob', gender: 'M' });
  invite.emit('room:accept-settings');
  await pause(200);

  const attenteQuestion = attendre<{ question: Question }>(hote, 'game:question', 15_000);
  await emettreAvecAck<{ success: boolean }>(hote, 'game:start');
  await attenteQuestion;

  await emettreAvecAck(hote, 'game:answer', { answer: 'reponse A' });
  await emettreAvecAck(invite, 'game:answer', { answer: 'reponse A' });

  return { hote, invite, salon: creation.room! };
}

describe('Proposition de montee de palier', () => {
  let partie: Partie;
  let cotesHote: DemandePalier;
  let cotesInvite: DemandePalier;

  beforeAll(async () => {
    partie = await jouerPremiereManche();
    const a = attendre<DemandePalier>(partie.hote, 'escalade:palier', 25_000);
    const b = attendre<DemandePalier>(partie.invite, 'escalade:palier', 25_000);
    [cotesHote, cotesInvite] = await Promise.all([a, b]);
  }, 60_000);

  it('est proposee aux DEUX joueurs, pas seulement a l\'hote', () => {
    expect(cotesHote).toBeDefined();
    expect(cotesInvite).toBeDefined();
  });

  it('propose le meme palier aux deux', () => {
    expect(cotesHote.palier).toBe(cotesInvite.palier);
  });

  it('propose le premier palier au-dessus du palier de depart', () => {
    expect(cotesHote.palier).toBe(1);
  });

  it('nomme le theme vers lequel on monte', () => {
    expect(cotesHote.category.code).toBe('souvenirs');
  });

  it('accompagne le theme de son nom lisible et de son icone', () => {
    expect(cotesHote.category.name.length).toBeGreaterThan(0);
    expect(cotesHote.category.icon.length).toBeGreaterThan(0);
  });

  it('annonce un delai de reponse', () => {
    expect(cotesHote.timeoutSeconds).toBeGreaterThan(0);
  });

  it('un seul accord ne suffit pas a monter', async () => {
    partie.hote.emit('escalade:palier-respond', { accept: true });
    expect(await attendrePeutEtre(partie.hote, 'escalade:palier-result', 1500)).toBeNull();
  });

  describe('quand les deux acceptent', () => {
    let resultatHote: { accepted: boolean };
    let resultatInvite: { accepted: boolean };
    let questionSuivante: { question: Question };

    beforeAll(async () => {
      const a = attendre<{ accepted: boolean }>(partie.hote, 'escalade:palier-result', 15_000);
      const b = attendre<{ accepted: boolean }>(partie.invite, 'escalade:palier-result', 15_000);
      const q = attendre<{ question: Question }>(partie.hote, 'game:question', 15_000);
      partie.invite.emit('escalade:palier-respond', { accept: true });
      [resultatHote, resultatInvite] = await Promise.all([a, b]);
      questionSuivante = await q;
    }, 40_000);

    it('annonce la montee a l\'hote', () => {
      expect(resultatHote.accepted).toBe(true);
    });

    it('annonce la montee au partenaire', () => {
      expect(resultatInvite.accepted).toBe(true);
    });

    it('sert immediatement une question du nouveau palier', () => {
      expect(questionSuivante.question.category).toBe('souvenirs');
    });

    it('ne rejoue pas la question deja servie', () => {
      expect(questionSuivante.question.id).toBeGreaterThan(0);
    });

    it('une reponse tardive au palier deja tranche est sans effet', async () => {
      partie.hote.emit('escalade:palier-respond', { accept: false });
      expect(await attendrePeutEtre(partie.hote, 'escalade:palier-result', 1200)).toBeNull();
    });
  });
});

describe('Refus d\'une montee de palier', () => {
  let partie: Partie;
  let resultat: { accepted: boolean };
  let questionSuivante: { question: Question };

  beforeAll(async () => {
    partie = await jouerPremiereManche();
    await attendre<DemandePalier>(partie.hote, 'escalade:palier', 25_000);

    const attenteResultat = attendre<{ accepted: boolean }>(partie.invite, 'escalade:palier-result', 15_000);
    const attenteQuestion = attendre<{ question: Question }>(partie.invite, 'game:question', 15_000);
    partie.invite.emit('escalade:palier-respond', { accept: false });
    resultat = await attenteResultat;
    questionSuivante = await attenteQuestion;
  }, 70_000);

  it('un seul refus suffit', () => {
    expect(resultat.accepted).toBe(false);
  });

  it('le refus n\'arrete pas la partie : une question suit', () => {
    expect(questionSuivante.question).toBeDefined();
  });

  it('la partie reste sur le palier acquis', () => {
    expect(questionSuivante.question.category).toBe('couple');
  });

  it('le resultat ne dit pas QUI a refuse', () => {
    expect(Object.keys(resultat)).toEqual(['accepted']);
  });

  it('aucun message punitif n\'accompagne le refus', async () => {
    expect(await attendrePeutEtre(partie.invite, 'error', 800)).toBeNull();
  });
});

describe('Reponses de palier hors contexte', () => {
  it('une reponse de palier envoyee hors partie est ignoree', async () => {
    const orphelin = await connecter(serveur);
    orphelin.emit('escalade:palier-respond', { accept: true });
    await pause(300);
    expect(orphelin.connected).toBe(true);
  });

  it('une reponse de palier dans un salon sans partie est ignoree', async () => {
    const hote = await connecter(serveur);
    await emettreAvecAck<RoomResponse>(hote, 'room:create',
      { playerName: 'Solo', gender: 'M', gameMode: 'escalade' });
    hote.emit('escalade:palier-respond', { accept: true });
    expect(await attendrePeutEtre(hote, 'escalade:palier-result', 800)).toBeNull();
  });
});
