import { initDatabase } from '../database.js';
import type {
  Question, Room, RoomResponse, RoomSettingsInfo,
  ModeProposal, ThemeChoiceRequest, ThemeChoiceWaiting,
} from '../types.js';
import {
  demarrerServeur, connecter, emettreAvecAck, attendre, attendrePeutEtre, pause,
  type HarnaisServeur, type ClientSocket,
} from './helpers/serveurTest.js';

/**
 * Changement de mode a deux, et choix de theme du mode duel.
 *
 * Un joueur ne peut pas imposer un autre jeu a son partenaire : il PROPOSE, et
 * l'autre tranche. Symetriquement, en duel, seul le joueur a qui le serveur a
 * rendu la main peut choisir le theme suivant — et une seule fois.
 */

const PORT = 3146;
let serveur: HarnaisServeur;

interface Duo { hote: ClientSocket; invite: ClientSocket; salon: Room; jetonHote: string }

beforeAll(async () => {
  initDatabase();
  serveur = await demarrerServeur(PORT);
}, 30_000);

afterAll(async () => {
  await serveur.fermer();
});

async function ouvrirDuo(options: Record<string, unknown> = {}): Promise<Duo> {
  const hote = await connecter(serveur);
  const creation = await emettreAvecAck<RoomResponse>(hote, 'room:create',
    { playerName: 'Alice', gender: 'F', ...options });
  const invite = await connecter(serveur);
  await emettreAvecAck<RoomResponse>(invite, 'room:join',
    { code: creation.room!.code, playerName: 'Bob', gender: 'M' });
  return { hote, invite, salon: creation.room!, jetonHote: creation.sessionToken! };
}

describe('Proposer un autre mode de jeu', () => {
  let duo: Duo;

  beforeAll(async () => {
    duo = await ouvrirDuo({ gameMode: 'classic' });
  });

  it('ignore une proposition de mode inconnu', async () => {
    duo.hote.emit('mode:propose', { mode: 'belote' });
    expect(await attendrePeutEtre<ModeProposal>(duo.invite, 'mode:proposal', 800)).toBeNull();
  });

  it('ignore une proposition du mode deja actif', async () => {
    duo.hote.emit('mode:propose', { mode: 'classic' });
    expect(await attendrePeutEtre<ModeProposal>(duo.invite, 'mode:proposal', 800)).toBeNull();
  });

  it('ignore une proposition sans champ mode', async () => {
    duo.hote.emit('mode:propose', {});
    expect(await attendrePeutEtre<ModeProposal>(duo.invite, 'mode:proposal', 800)).toBeNull();
  });

  describe('proposition valide', () => {
    let proposition: ModeProposal;
    let recueParLeProposant: ModeProposal | null;

    beforeAll(async () => {
      const attenteInvite = attendre<ModeProposal>(duo.invite, 'mode:proposal', 5000);
      const espionHote = attendrePeutEtre<ModeProposal>(duo.hote, 'mode:proposal', 1500);
      duo.hote.emit('mode:propose', { mode: 'complices' });
      proposition = await attenteInvite;
      recueParLeProposant = await espionHote;
    });

    it('atteint le partenaire', () => {
      expect(proposition.mode).toBe('complices');
    });

    it('porte le libelle du mode propose', () => {
      expect(proposition.label).toBe('Complices');
    });

    it('porte l\'icone du mode propose', () => {
      expect(proposition.icon.length).toBeGreaterThan(0);
    });

    it('nomme le joueur a l\'origine de la proposition', () => {
      expect(proposition.fromPlayerId).toBe(1);
      expect(proposition.fromName).toBe('Alice');
    });

    it('annonce un delai de reponse', () => {
      expect(proposition.timeoutSeconds).toBe(30);
    });

    it('n\'est pas renvoyee au proposant lui-meme', () => {
      expect(recueParLeProposant).toBeNull();
    });

    it('le proposant ne peut pas repondre a sa propre proposition', async () => {
      duo.hote.emit('mode:respond', { accept: true });
      expect(await attendrePeutEtre(duo.invite, 'mode:changed', 800)).toBeNull();
    });

    it('une seconde proposition est ignoree tant que la premiere est en attente', async () => {
      duo.hote.emit('mode:propose', { mode: 'duel' });
      expect(await attendrePeutEtre<ModeProposal>(duo.invite, 'mode:proposal', 800)).toBeNull();
    });
  });

  describe('refus du partenaire', () => {
    let refus: { byName: string };
    let changementRecu: unknown;

    beforeAll(async () => {
      const attenteRefus = attendre<{ byName: string }>(duo.hote, 'mode:declined', 5000);
      const espionChangement = attendrePeutEtre(duo.hote, 'mode:changed', 1500);
      duo.invite.emit('mode:respond', { accept: false });
      refus = await attenteRefus;
      changementRecu = await espionChangement;
    });

    it('previent le proposant', () => {
      expect(refus).toBeDefined();
    });

    it('nomme celui qui a refuse', () => {
      expect(refus.byName).toBe('Bob');
    });

    it('ne change pas le mode', () => {
      expect(changementRecu).toBeNull();
    });

    it('libere la place pour une nouvelle proposition', async () => {
      const attente = attendre<ModeProposal>(duo.invite, 'mode:proposal', 5000);
      duo.hote.emit('mode:propose', { mode: 'duel' });
      expect((await attente).mode).toBe('duel');
      duo.invite.emit('mode:respond', { accept: false });
      await pause(200);
    });
  });

  describe('acceptation du partenaire', () => {
    let cotesHote: { mode: string; label: string; icon: string };
    let cotesInvite: { mode: string };

    beforeAll(async () => {
      const a = attendre<typeof cotesHote>(duo.hote, 'mode:changed', 5000);
      const b = attendre<typeof cotesInvite>(duo.invite, 'mode:changed', 5000);
      duo.hote.emit('mode:propose', { mode: 'sudden_death' });
      await attendre<ModeProposal>(duo.invite, 'mode:proposal', 5000);
      duo.invite.emit('mode:respond', { accept: true });
      [cotesHote, cotesInvite] = await Promise.all([a, b]);
    });

    it('annonce le changement a l\'hote', () => {
      expect(cotesHote.mode).toBe('sudden_death');
    });

    it('annonce le changement au partenaire', () => {
      expect(cotesInvite.mode).toBe('sudden_death');
    });

    it('porte le libelle et l\'icone du nouveau mode', () => {
      expect(cotesHote.label).toBe('Mort subite');
      expect(cotesHote.icon.length).toBeGreaterThan(0);
    });

    it('le nouveau mode est retenu dans les reglages du salon', async () => {
      const revenant = await connecter(serveur);
      const attente = attendre<RoomSettingsInfo>(revenant, 'room:settings', 5000);
      await emettreAvecAck<RoomResponse>(revenant, 'room:reconnect', {
        code: duo.salon.code, playerId: 1, sessionToken: duo.jetonHote,
      });
      expect((await attente).gameMode).toBe('sudden_death');
    });
  });

  describe('bascule vers le mix', () => {
    it('efface les themes restreints du salon', async () => {
      const autre = await ouvrirDuo({ gameMode: 'classic', categories: ['couple', 'fun'] });
      const attenteChangement = attendre(autre.hote, 'mode:changed', 5000);
      autre.hote.emit('mode:propose', { mode: 'mix' });
      await attendre<ModeProposal>(autre.invite, 'mode:proposal', 5000);
      autre.invite.emit('mode:respond', { accept: true });
      await attenteChangement;

      const revenant = await connecter(serveur);
      const attenteReglages = attendre<RoomSettingsInfo>(revenant, 'room:settings', 5000);
      await emettreAvecAck<RoomResponse>(revenant, 'room:reconnect', {
        code: autre.salon.code, playerId: 1, sessionToken: autre.jetonHote,
      });
      const reglages = await attenteReglages;

      expect(reglages.gameMode).toBe('mix');
      expect(reglages.categories).toEqual([]);
    });
  });

  it('une proposition envoyee par un socket hors salon est ignoree', async () => {
    const orphelin = await connecter(serveur);
    orphelin.emit('mode:propose', { mode: 'duel' });
    expect(await attendrePeutEtre(duo.invite, 'mode:proposal', 800)).toBeNull();
  });
});

describe('Mode duel — le gagnant choisit le theme suivant', () => {
  let duo: Duo;
  let demande: ThemeChoiceRequest;
  let attente: ThemeChoiceWaiting;
  let choisisseur: ClientSocket;
  let spectateur: ClientSocket;

  beforeAll(async () => {
    duo = await ouvrirDuo({ gameMode: 'duel', categories: ['culture'], questionTypes: ['H'] });
    duo.invite.emit('room:accept-settings');
    await pause(200);

    const attenteQuestion = attendre<{ question: Question }>(duo.hote, 'game:question', 10_000);
    await emettreAvecAck<{ success: boolean }>(duo.hote, 'game:start');
    await attenteQuestion;

    const choixHote = attendrePeutEtre<ThemeChoiceRequest>(duo.hote, 'duel:choose-theme', 20_000);
    const choixInvite = attendrePeutEtre<ThemeChoiceRequest>(duo.invite, 'duel:choose-theme', 20_000);
    const attenteHote = attendrePeutEtre<ThemeChoiceWaiting>(duo.hote, 'duel:awaiting-theme', 20_000);
    const attenteInvite = attendrePeutEtre<ThemeChoiceWaiting>(duo.invite, 'duel:awaiting-theme', 20_000);

    await emettreAvecAck(duo.hote, 'game:answer', { answer: 'reponse A' });
    await pause(150);
    await emettreAvecAck(duo.invite, 'game:answer', { answer: 'reponse B' });

    const [cH, cI, aH, aI] = await Promise.all([choixHote, choixInvite, attenteHote, attenteInvite]);
    demande = (cH ?? cI)!;
    attente = (aH ?? aI)!;
    choisisseur = cH ? duo.hote : duo.invite;
    spectateur = cH ? duo.invite : duo.hote;
  }, 60_000);

  it('rend la main a exactement un joueur', () => {
    expect(demande).toBeDefined();
    expect(attente).toBeDefined();
  });

  it('propose une liste de themes non vide', () => {
    expect(demande.options.length).toBeGreaterThan(0);
  });

  it('ne propose que des themes contenant des questions', () => {
    expect(demande.options.every(o => o.questionCount > 0)).toBe(true);
  });

  it('chaque theme propose porte un nom, une icone et une couleur', () => {
    for (const o of demande.options) {
      expect(o.name.length).toBeGreaterThan(0);
      expect(o.icon.length).toBeGreaterThan(0);
      expect(o.color.length).toBeGreaterThan(0);
    }
  });

  it('respecte les themes autorises par le salon', () => {
    expect(demande.options.map(o => o.code)).toEqual(['culture']);
  });

  it('annonce un delai avant tirage automatique', () => {
    expect(demande.timeoutSeconds).toBeGreaterThan(0);
  });

  it('annonce le numero de la manche', () => {
    expect(demande.roundNumber).toBeGreaterThanOrEqual(1);
  });

  it('l\'autre joueur est informe qu\'il attend, et de qui', () => {
    expect(['Alice', 'Bob']).toContain(attente.chooserName);
    expect([1, 2]).toContain(attente.chooserPlayerId);
  });

  it('l\'autre joueur connait la raison de l\'attente', () => {
    expect(['winner', 'faster', 'tiebreak']).toContain(attente.reason);
  });

  it('ignore un choix envoye par le joueur qui n\'a pas la main', async () => {
    spectateur.emit('duel:choose-theme', { category: 'couple' });
    expect(await attendrePeutEtre(choisisseur, 'duel:theme-selected', 1000)).toBeNull();
  });

  it('ignore un theme inexistant', async () => {
    choisisseur.emit('duel:choose-theme', { category: 'theme_fantome' });
    expect(await attendrePeutEtre(choisisseur, 'duel:theme-selected', 1000)).toBeNull();
  });

  it('ignore une trame sans categorie', async () => {
    choisisseur.emit('duel:choose-theme', {});
    expect(await attendrePeutEtre(choisisseur, 'duel:theme-selected', 1000)).toBeNull();
  });

  describe('choix valide', () => {
    let selection: { category: string; name: string; icon: string; chooserPlayerId: 1 | 2; autoPicked: boolean };
    let questionSuivante: { question: Question };

    beforeAll(async () => {
      const attenteSelection = attendre<typeof selection>(spectateur, 'duel:theme-selected', 10_000);
      const attenteQuestion = attendre<typeof questionSuivante>(spectateur, 'game:question', 10_000);
      choisisseur.emit('duel:choose-theme', { category: 'culture' });
      selection = await attenteSelection;
      questionSuivante = await attenteQuestion;
    }, 30_000);

    it('annonce le theme retenu aux deux joueurs', () => {
      expect(selection.category).toBe('culture');
    });

    it('accompagne le theme de son nom et de son icone', () => {
      expect(selection.name.length).toBeGreaterThan(0);
      expect(selection.icon.length).toBeGreaterThan(0);
    });

    it('indique qu\'il ne s\'agit pas d\'un tirage automatique', () => {
      expect(selection.autoPicked).toBe(false);
    });

    it('designe le joueur qui a choisi', () => {
      expect([1, 2]).toContain(selection.chooserPlayerId);
    });

    it('enchaine sur une question du theme choisi', () => {
      expect(questionSuivante.question.category).toBe('culture');
    });

    it('un second choix du meme joueur n\'a plus d\'effet', async () => {
      choisisseur.emit('duel:choose-theme', { category: 'couple' });
      expect(await attendrePeutEtre(spectateur, 'duel:theme-selected', 1000)).toBeNull();
    });
  });
});
