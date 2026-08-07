import {
  db, initDatabase,
  mergeLegacyCategories, fixQuestionInputTypes, purgeSyntheticQuestions,
  cleanupExpiredRooms,
} from '../database.js';

/**
 * Migrations jouees a CHAQUE demarrage. Elles doivent donc etre idempotentes :
 * une migration qui se rejoue mal casse la base de production a chaque deploiement.
 *
 * Elles reparent des degats reels : 690 questions rattachees a une categorie
 * inexistante (donc jamais servies), 131 questions dont le type de saisie
 * contredisait l'enonce (« Decris... » servi avec un curseur 1-10), et les
 * questions synthetiques du mode « A l'envers » qui faisaient grossir la table
 * indefiniment.
 */

function insereQuestion(type: string, category: string, text: string, active = 1): number {
  return db.prepare(`
    INSERT INTO questions (type, category, text, timer, active) VALUES (?, ?, ?, 20, ?)
  `).run(type, category, text, active).lastInsertRowid as number;
}

function lit(id: number): { type: string; category: string } | undefined {
  return db.prepare('SELECT type, category FROM questions WHERE id = ?').get(id) as
    { type: string; category: string } | undefined;
}

beforeAll(() => {
  initDatabase();
});

describe('mergeLegacyCategories — rattacher les questions orphelines', () => {
  const RATTACHEMENTS: [string, string][] = [
    ['connaissance', 'couple'],
    ['amour', 'couple'],
    ['quotidien', 'habitudes'],
    ['comportement', 'habitudes'],
    ['sextoys', 'coquin'],
    ['confessions', 'coquin'],
    ['seduction', 'preliminaires'],
    ['massage', 'preliminaires'],
    ['anal', 'sodomie'],
  ];

  for (const [ancienne, nouvelle] of RATTACHEMENTS) {
    it(`rattache « ${ancienne} » a « ${nouvelle} »`, () => {
      const id = insereQuestion('A', ancienne, `Question heritee de ${ancienne} ${Math.random()}`);
      mergeLegacyCategories();
      expect(lit(id)?.category).toBe(nouvelle);
      db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    });
  }

  it('ne touche pas aux categories deja jouables', () => {
    const id = insereQuestion('A', 'couple', `Deja jouable ${Math.random()}`);
    mergeLegacyCategories();
    expect(lit(id)?.category).toBe('couple');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('ne touche pas a une categorie inconnue du tableau de correspondance', () => {
    const id = insereQuestion('A', 'categorie_exotique', `Exotique ${Math.random()}`);
    mergeLegacyCategories();
    expect(lit(id)?.category).toBe('categorie_exotique');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('rattache aussi les questions inactives', () => {
    const id = insereQuestion('A', 'amour', `Inactive heritee ${Math.random()}`, 0);
    mergeLegacyCategories();
    expect(lit(id)?.category).toBe('couple');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('traite plusieurs questions d\'un coup', () => {
    const ids = RATTACHEMENTS.map(([ancienne]) =>
      insereQuestion('A', ancienne, `Lot ${ancienne} ${Math.random()}`));
    mergeLegacyCategories();
    expect(ids.map(id => lit(id)!.category))
      .toEqual(RATTACHEMENTS.map(([, nouvelle]) => nouvelle));
    for (const id of ids) db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('est idempotent : une seconde passe ne change plus rien', () => {
    const id = insereQuestion('A', 'quotidien', `Idempotence ${Math.random()}`);
    mergeLegacyCategories();
    const apresUne = lit(id)!.category;
    mergeLegacyCategories();
    mergeLegacyCategories();
    expect(lit(id)!.category).toBe(apresUne);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('ne laisse plus aucune question sur les codes historiques', () => {
    for (const [ancienne] of RATTACHEMENTS) {
      insereQuestion('A', ancienne, `Balayage ${ancienne} ${Math.random()}`);
    }
    mergeLegacyCategories();
    const restants = db.prepare(
      `SELECT DISTINCT category FROM questions WHERE category IN (${RATTACHEMENTS.map(() => '?').join(',')})`
    ).all(...RATTACHEMENTS.map(([a]) => a)) as { category: string }[];
    expect(restants).toEqual([]);
  });

  it('les categories cibles existent bien dans la table des themes', () => {
    const cibles = [...new Set(RATTACHEMENTS.map(([, n]) => n))];
    for (const code of cibles) {
      const row = db.prepare('SELECT code FROM categories WHERE code = ?').get(code);
      expect(row).toBeDefined();
    }
  });

  it('ne cree ni ne supprime de question', () => {
    const avant = (db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c;
    mergeLegacyCategories();
    const apres = (db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c;
    expect(apres).toBe(avant);
  });
});

describe('fixQuestionInputTypes — reparer le type de saisie', () => {
  const VERS_TEXTE = [
    'Décris la position que tu preferes',
    'Decris ton meilleur souvenir',
    'Quel mot te vient en premier ?',
    'Comment tu me vois dans dix ans ?',
    "Qu'est-ce qui te fait vibrer ?",
    "Qu'est-ce que tu changerais ?",
    'Quel conseil donnerais-tu ?',
    'Raconte notre premiere fois',
    'Avoue une chose que tu caches',
    'Décrivez votre semaine ideale',
  ];

  for (const enonce of VERS_TEXTE) {
    it(`bascule vers le champ libre : « ${enonce.slice(0, 32)}... »`, () => {
      const id = insereQuestion('D', 'couple', `${enonce} ${Math.random()}`);
      fixQuestionInputTypes();
      expect(lit(id)?.type).toBe('C');
      db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    });
  }

  const VERS_ECHELLE = [
    'Tu me notes combien sur 10 ?',
    'Ta note sur 10 pour notre couple ?',
    'À quel point tu es heureux(se) ?',
    'A quel point tu me fais confiance ?',
    'Quel pourcentage de ton temps m\'est consacre ?',
  ];

  for (const enonce of VERS_ECHELLE) {
    it(`bascule vers le curseur 1-10 : « ${enonce.slice(0, 32)}... »`, () => {
      const id = insereQuestion('C', 'couple', `${enonce} ${Math.random()}`);
      fixQuestionInputTypes();
      expect(lit(id)?.type).toBe('D');
      db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    });
  }

  it('ne bascule pas un enonce descriptif qui demande AUSSI une note', () => {
    const id = insereQuestion('D', 'couple', `Décris à quel point tu m'aimes ${Math.random()}`);
    fixQuestionInputTypes();
    expect(lit(id)?.type).toBe('D');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('laisse tranquille un enonce d\'echelle deja correct', () => {
    const id = insereQuestion('D', 'couple', `Ton envie du moment sur 10 ${Math.random()}`);
    fixQuestionInputTypes();
    expect(lit(id)?.type).toBe('D');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('laisse tranquille une question ouverte deja correcte', () => {
    const id = insereQuestion('C', 'couple', `Ton plus beau souvenir avec moi ${Math.random()}`);
    fixQuestionInputTypes();
    expect(lit(id)?.type).toBe('C');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('ne regarde que les types C et D : un QCM descriptif reste un QCM', () => {
    const id = insereQuestion('A', 'couple', `Décris ce que tu preferes ${Math.random()}`);
    fixQuestionInputTypes();
    expect(lit(id)?.type).toBe('A');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('ignore la casse de l\'enonce', () => {
    const id = insereQuestion('D', 'couple', `DÉCRIS TON FANTASME ${Math.random()}`);
    fixQuestionInputTypes();
    expect(lit(id)?.type).toBe('C');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('ignore les espaces en debut d\'enonce', () => {
    const id = insereQuestion('D', 'couple', `   Raconte notre rencontre ${Math.random()}`);
    fixQuestionInputTypes();
    expect(lit(id)?.type).toBe('C');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('n\'agit que sur un debut d\'enonce, pas au milieu du texte', () => {
    const id = insereQuestion('D', 'couple', `Sur 10, comment tu evalues notre complicite ${Math.random()}`);
    fixQuestionInputTypes();
    expect(lit(id)?.type).toBe('D');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('est idempotent : rejouer la migration ne rebascule pas la question', () => {
    const id = insereQuestion('D', 'couple', `Décris notre premiere nuit ${Math.random()}`);
    fixQuestionInputTypes();
    fixQuestionInputTypes();
    fixQuestionInputTypes();
    expect(lit(id)?.type).toBe('C');
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('ne fait pas osciller une question entre C et D', () => {
    // Enonce a la fois descriptif ET « a quel point » : il doit se stabiliser
    // sur le curseur, pas basculer d'un type a l'autre a chaque demarrage.
    const id = insereQuestion('C', 'couple', `Décris à quel point tu tiens a moi ${Math.random()}`);
    const parcours: string[] = [];
    for (let i = 0; i < 5; i++) {
      fixQuestionInputTypes();
      parcours.push(lit(id)!.type);
    }
    expect(parcours).toEqual(['D', 'D', 'D', 'D', 'D']);
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('ne cree ni ne supprime de question', () => {
    const avant = (db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c;
    fixQuestionInputTypes();
    expect((db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c).toBe(avant);
  });

  it('laisse la base sans question descriptive branchee sur un curseur', () => {
    fixQuestionInputTypes();
    const restants = db.prepare(`
      SELECT COUNT(*) c FROM questions
      WHERE type = 'D' AND (
        text LIKE 'Décris%' OR text LIKE 'Decris%' OR text LIKE 'Raconte%' OR text LIKE 'Avoue%'
      ) AND text NOT LIKE '%sur 10%' AND text NOT LIKE '%quel point%'
    `).get() as { c: number };
    expect(restants.c).toBe(0);
  });
});

describe('purgeSyntheticQuestions — nettoyer les manches du mode « A l\'envers »', () => {
  const MARQUEUR = '« bleu »\n\nDe quelle question cette réponse vient-elle ?';

  it('supprime une question synthetique inactive', () => {
    const id = insereQuestion('H', 'couple', MARQUEUR, 0);
    purgeSyntheticQuestions();
    expect(lit(id)).toBeUndefined();
  });

  it('conserve une question active portant le meme texte', () => {
    const id = insereQuestion('H', 'couple', MARQUEUR, 1);
    purgeSyntheticQuestions();
    expect(lit(id)).toBeDefined();
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('conserve une question inactive ordinaire', () => {
    const id = insereQuestion('A', 'couple', `Question inactive ordinaire ${Math.random()}`, 0);
    purgeSyntheticQuestions();
    expect(lit(id)).toBeDefined();
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  });

  it('supprime plusieurs manches synthetiques d\'un coup', () => {
    const ids = [1, 2, 3, 4, 5].map(i => insereQuestion('H', 'couple', `« r${i} »\n\nDe quelle question cette réponse vient-elle ?`, 0));
    purgeSyntheticQuestions();
    expect(ids.map(lit).filter(Boolean)).toEqual([]);
  });

  it('emporte les reponses rattachees grace a la cascade', () => {
    const room = db.prepare(`INSERT INTO rooms (code, player1_name, status) VALUES ('900001', 'Test', 'playing')`).run();
    const game = db.prepare('INSERT INTO games (room_id) VALUES (?)').run(room.lastInsertRowid);
    const qid = insereQuestion('H', 'couple', MARQUEUR, 0);
    db.prepare('INSERT INTO answers (game_id, question_id, player_id, answer) VALUES (?, ?, 1, ?)')
      .run(game.lastInsertRowid, qid, 'une reponse intime');

    purgeSyntheticQuestions();

    const restantes = db.prepare('SELECT COUNT(*) c FROM answers WHERE question_id = ?').get(qid) as { c: number };
    expect(restantes.c).toBe(0);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(room.lastInsertRowid);
  });

  it('est idempotent : la seconde passe ne supprime plus rien', () => {
    insereQuestion('H', 'couple', MARQUEUR, 0);
    purgeSyntheticQuestions();
    const avant = (db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c;
    purgeSyntheticQuestions();
    purgeSyntheticQuestions();
    expect((db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c).toBe(avant);
  });

  it('ne supprime rien quand aucune manche synthetique n\'existe', () => {
    purgeSyntheticQuestions();
    const avant = (db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c;
    purgeSyntheticQuestions();
    expect((db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c).toBe(avant);
  });

  it('laisse la base sans aucune manche synthetique apres initDatabase', () => {
    initDatabase();
    const restantes = db.prepare(
      "SELECT COUNT(*) c FROM questions WHERE active = 0 AND text LIKE '%De quelle question cette réponse vient-elle%'"
    ).get() as { c: number };
    expect(restantes.c).toBe(0);
  });
});

describe('Schema et migrations structurelles', () => {
  const colonnes = (table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name);

  it('la table des salons porte les colonnes de genre', () => {
    expect(colonnes('rooms')).toEqual(expect.arrayContaining(['player1_gender', 'player2_gender']));
  });

  it('la table des salons porte les colonnes de jeton de session', () => {
    expect(colonnes('rooms')).toEqual(expect.arrayContaining(['player1_token', 'player2_token']));
  });

  it('la table des questions porte la colonne de bonne reponse', () => {
    expect(colonnes('questions')).toContain('correct_answer');
  });

  it('la table des questions porte les colonnes d\'emoji du type I', () => {
    expect(colonnes('questions')).toEqual(expect.arrayContaining(['emoji_a', 'emoji_b']));
  });

  it('les cles etrangeres sont actives', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('rejouer initDatabase ne duplique pas les themes', () => {
    const avant = (db.prepare('SELECT COUNT(*) c FROM categories').get() as { c: number }).c;
    initDatabase();
    expect((db.prepare('SELECT COUNT(*) c FROM categories').get() as { c: number }).c).toBe(avant);
  });

  it('rejouer initDatabase ne duplique pas les types de question', () => {
    const avant = (db.prepare('SELECT COUNT(*) c FROM question_types').get() as { c: number }).c;
    initDatabase();
    expect((db.prepare('SELECT COUNT(*) c FROM question_types').get() as { c: number }).c).toBe(avant);
  });

  it('rejouer initDatabase ne duplique pas les questions du seed', () => {
    const avant = (db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c;
    initDatabase();
    expect((db.prepare('SELECT COUNT(*) c FROM questions').get() as { c: number }).c).toBe(avant);
  });

  it('aucun code de theme n\'est duplique', () => {
    const doublons = db.prepare(`
      SELECT code FROM categories GROUP BY code HAVING COUNT(*) > 1
    `).all();
    expect(doublons).toEqual([]);
  });
});

describe('cleanupExpiredRooms — menage des vieux salons', () => {
  it('supprime un salon inactif depuis plus de sept jours', () => {
    const room = db.prepare(`
      INSERT INTO rooms (code, player1_name, status, last_activity)
      VALUES ('900002', 'Vieux', 'waiting', datetime('now', '-8 days'))
    `).run();
    cleanupExpiredRooms();
    expect(db.prepare('SELECT id FROM rooms WHERE id = ?').get(room.lastInsertRowid)).toBeUndefined();
  });

  it('conserve un salon actif recemment', () => {
    const room = db.prepare(`
      INSERT INTO rooms (code, player1_name, status, last_activity)
      VALUES ('900003', 'Recent', 'waiting', datetime('now', '-1 days'))
    `).run();
    cleanupExpiredRooms();
    expect(db.prepare('SELECT id FROM rooms WHERE id = ?').get(room.lastInsertRowid)).toBeDefined();
    db.prepare('DELETE FROM rooms WHERE id = ?').run(room.lastInsertRowid);
  });

  it('est idempotent', () => {
    cleanupExpiredRooms();
    const avant = (db.prepare('SELECT COUNT(*) c FROM rooms').get() as { c: number }).c;
    cleanupExpiredRooms();
    expect((db.prepare('SELECT COUNT(*) c FROM rooms').get() as { c: number }).c).toBe(avant);
  });
});
