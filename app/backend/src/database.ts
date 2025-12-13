import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/database.sqlite');

// Create parent directory if it doesn't exist
const dbDir = path.dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

export const db: DatabaseType = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDatabase() {
  // Create tables
  db.exec(`
    -- Question Types table (administrable)
    CREATE TABLE IF NOT EXISTS question_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      scoring_mode TEXT NOT NULL DEFAULT 'match' CHECK(scoring_mode IN ('match', 'consensus', 'proximity', 'none')),
      input_type TEXT NOT NULL DEFAULT 'options' CHECK(input_type IN ('options', 'binary', 'scale', 'text', 'who')),
      icon TEXT,
      color TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Categories table (administrable)
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      description TEXT,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    );

    -- Rooms table
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      player1_name TEXT,
      player2_name TEXT,
      status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting', 'playing', 'finished')),
      created_at TEXT DEFAULT (datetime('now')),
      last_activity TEXT DEFAULT (datetime('now'))
    );

    -- Questions table (updated with foreign keys)
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      options TEXT,
      option_a TEXT,
      option_b TEXT,
      timer INTEGER DEFAULT 20,
      active INTEGER DEFAULT 1
    );

    -- Games table
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      score_player1 INTEGER DEFAULT 0,
      score_player2 INTEGER DEFAULT 0,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    -- Answers table
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL CHECK(player_id IN (1, 2)),
      answer TEXT NOT NULL,
      answered_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    -- Admin table
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
    CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
    CREATE INDEX IF NOT EXISTS idx_games_room ON games(room_id);
    CREATE INDEX IF NOT EXISTS idx_answers_game ON answers(game_id);
    CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(active);
    CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(active);
    CREATE INDEX IF NOT EXISTS idx_question_types_active ON question_types(active);
  `);

  // Insert default question types if not exists
  initDefaultQuestionTypes();
  initDefaultCategories();
  initDefaultQuestions();

  console.log('Database initialized successfully');
}

function initDefaultQuestionTypes() {
  const types = [
    {
      code: 'A',
      name: 'Devine sa reponse',
      description: 'Devinez ce que votre partenaire va repondre',
      scoring_mode: 'match',
      input_type: 'options',
      icon: '🎯',
      color: '#e21b3c'
    },
    {
      code: 'B',
      name: 'Repondez pareil',
      description: 'Points si vos reponses sont identiques',
      scoring_mode: 'match',
      input_type: 'options',
      icon: '🤝',
      color: '#1368ce'
    },
    {
      code: 'C',
      name: 'Question ouverte',
      description: 'Reponse libre, pas de scoring',
      scoring_mode: 'none',
      input_type: 'text',
      icon: '💬',
      color: '#d89e00'
    },
    {
      code: 'D',
      name: 'Echelle',
      description: 'Choisissez un chiffre de 1 a 10',
      scoring_mode: 'proximity',
      input_type: 'scale',
      icon: '📊',
      color: '#26890c'
    },
    {
      code: 'E',
      name: 'Tu es plutot...',
      description: 'Choix entre deux options',
      scoring_mode: 'match',
      input_type: 'binary',
      icon: '⚖️',
      color: '#9b59b6'
    },
    {
      code: 'F',
      name: 'Qui de nous deux',
      description: 'Qui correspond le mieux a la description?',
      scoring_mode: 'consensus',
      input_type: 'who',
      icon: '👫',
      color: '#e91e63'
    }
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO question_types (code, name, description, scoring_mode, input_type, icon, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const type of types) {
    insert.run(type.code, type.name, type.description, type.scoring_mode, type.input_type, type.icon, type.color);
  }
}

function initDefaultCategories() {
  const categories = [
    { code: 'couple', name: 'Couple', icon: '❤️', color: '#e91e63', description: 'Questions sur votre relation', sort_order: 1 },
    { code: 'preferences', name: 'Preferences', icon: '⭐', color: '#ff9800', description: 'Gouts et preferences', sort_order: 2 },
    { code: 'habitudes', name: 'Habitudes', icon: '🏠', color: '#4caf50', description: 'Vie quotidienne', sort_order: 3 },
    { code: 'souvenirs', name: 'Souvenirs', icon: '📸', color: '#2196f3', description: 'Moments partages', sort_order: 4 },
    { code: 'projets', name: 'Projets', icon: '🚀', color: '#9c27b0', description: 'Avenir et reves', sort_order: 5 },
    { code: 'sexy', name: 'Sexy', icon: '🔥', color: '#f44336', description: 'Questions coquines', sort_order: 6 },
    { code: 'coquin', name: 'Coquin', icon: '😈', color: '#e91e63', description: 'Pour pimenter', sort_order: 7 },
    { code: 'fun', name: 'Fun', icon: '🎉', color: '#ffeb3b', description: 'Questions fun et legeres', sort_order: 8 }
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO categories (code, name, icon, color, description, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const cat of categories) {
    insert.run(cat.code, cat.name, cat.icon, cat.color, cat.description, cat.sort_order);
  }
}

function initDefaultQuestions() {
  // Check if questions already exist
  const count = db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number };
  if (count.count > 0) return;

  const questions = [
    // === TYPE A - Devine sa réponse ===
    { type: 'A', category: 'couple', text: 'Quel est mon reve secret que je n\'ai jamais realise ?', options: JSON.stringify(['Voyager seul(e)', 'Changer de metier', 'Vivre a l\'etranger', 'Apprendre un instrument']), timer: 20 },
    { type: 'A', category: 'couple', text: 'Qu\'est-ce qui me met vraiment en colere ?', options: JSON.stringify(['Le mensonge', 'L\'injustice', 'Le manque de respect', 'Etre ignore(e)']), timer: 20 },
    { type: 'A', category: 'couple', text: 'Si je pouvais avoir un superpouvoir, ce serait...', options: JSON.stringify(['Lire les pensees', 'Voler', 'Etre invisible', 'Teleportation']), timer: 20 },
    { type: 'A', category: 'preferences', text: 'Quelle est la chose qui me fait le plus rire ?', options: JSON.stringify(['Blagues absurdes', 'Fails videos', 'Situations gênantes', 'Sarcasme']), timer: 20 },
    { type: 'A', category: 'habitudes', text: 'Qu\'est-ce que je fais en premier le matin ?', options: JSON.stringify(['Regarder mon tel', 'Cafe/The', 'Douche', 'Rester au lit']), timer: 20 },
    { type: 'A', category: 'souvenirs', text: 'Quel moment de notre relation m\'a le plus marque ?', options: JSON.stringify(['Notre rencontre', 'Premier voyage', 'Une surprise', 'Une dispute resolue']), timer: 25 },
    { type: 'A', category: 'preferences', text: 'Quel est le cadeau qui me ferait le plus plaisir ?', options: JSON.stringify(['Experience/Voyage', 'Objet utile', 'Quelque chose fait main', 'Une surprise']), timer: 20 },
    { type: 'A', category: 'couple', text: 'Qu\'est-ce qui m\'attire le plus chez toi ?', options: JSON.stringify(['Ton humour', 'Ton intelligence', 'Ta gentillesse', 'Ton physique']), timer: 20 },

    // === TYPE B - Répondez pareil ===
    { type: 'B', category: 'couple', text: 'Si on gagnait au loto, on ferait quoi en premier ?', options: JSON.stringify(['Tour du monde', 'Acheter une maison', 'Investir', 'Tout claquer en folie']), timer: 20 },
    { type: 'B', category: 'couple', text: 'Notre chanson de couple serait plutot...', options: JSON.stringify(['Romantique', 'Festive', 'Nostalgique', 'On n\'en a pas']), timer: 20 },
    { type: 'B', category: 'projets', text: 'La maison ideale pour nous serait...', options: JSON.stringify(['Appartement en ville', 'Maison campagne', 'Loft moderne', 'Tiny house']), timer: 20 },
    { type: 'B', category: 'couple', text: 'Notre plus grande force en tant que couple ?', options: JSON.stringify(['Communication', 'Humour', 'Complicite', 'Confiance']), timer: 20 },
    { type: 'B', category: 'habitudes', text: 'La soiree parfaite pour nous c\'est...', options: JSON.stringify(['Netflix & chill', 'Sortie entre amis', 'Restaurant chic', 'Jeux de societe']), timer: 20 },
    { type: 'B', category: 'projets', text: 'Dans 10 ans, on sera...', options: JSON.stringify(['Parents epanouis', 'Expatries', 'Memes qu\'aujourd\'hui', 'Millionnaires']), timer: 20 },
    { type: 'B', category: 'fun', text: 'Si on etait un duo celebre, on serait...', options: JSON.stringify(['Bonnie & Clyde', 'Romeo & Juliette', 'Shrek & Fiona', 'Autre']), timer: 15 },
    { type: 'B', category: 'sexy', text: 'L\'endroit le plus insolite ou on aimerait s\'embrasser ?', options: JSON.stringify(['Sous la pluie', 'Au sommet d\'une montagne', 'Dans un avion', 'Sous l\'eau']), timer: 20 },

    // === TYPE C - Questions ouvertes ===
    { type: 'C', category: 'couple', text: 'Quelle est la chose la plus folle que tu ferais pour moi ?', timer: 30 },
    { type: 'C', category: 'couple', text: 'Qu\'est-ce que tu n\'as jamais ose me dire ?', timer: 30 },
    { type: 'C', category: 'souvenirs', text: 'Decris notre premier baiser en 3 mots', timer: 25 },
    { type: 'C', category: 'couple', text: 'Si tu devais me decrire a un inconnu, tu dirais quoi ?', timer: 30 },
    { type: 'C', category: 'projets', text: 'Quel pays on doit absolument visiter ensemble ?', timer: 20 },
    { type: 'C', category: 'couple', text: 'Quelle habitude de moi t\'agace (secretement) ?', timer: 25 },
    { type: 'C', category: 'souvenirs', text: 'Quel est le moment ou tu as su que c\'etait serieux entre nous ?', timer: 30 },
    { type: 'C', category: 'fun', text: 'Si on devait ouvrir un business ensemble, ce serait quoi ?', timer: 25 },
    { type: 'C', category: 'sexy', text: 'Quel est ton fantasme inavoue ?', timer: 30 },
    { type: 'C', category: 'couple', text: 'Qu\'est-ce que tu voudrais qu\'on fasse plus souvent ?', timer: 25 },

    // === TYPE D - Échelle 1-10 ===
    { type: 'D', category: 'couple', text: 'A quel point tu me fais confiance ? (1-10)', timer: 15 },
    { type: 'D', category: 'couple', text: 'A quel point notre relation est passionnee ? (1-10)', timer: 15 },
    { type: 'D', category: 'habitudes', text: 'A quel point tu es bordélique ? (1-10)', timer: 15 },
    { type: 'D', category: 'couple', text: 'A quel point tu as besoin de ton espace perso ? (1-10)', timer: 15 },
    { type: 'D', category: 'sexy', text: 'A quel point tu es ouvert(e) aux nouvelles experiences ? (1-10)', timer: 15 },
    { type: 'D', category: 'couple', text: 'A quel point tu es pret(e) a faire des compromis ? (1-10)', timer: 15 },
    { type: 'D', category: 'fun', text: 'A quel point tu es competitif/competitive ? (1-10)', timer: 15 },
    { type: 'D', category: 'couple', text: 'A quel point tu exprimes tes emotions ? (1-10)', timer: 15 },

    // === TYPE E - Tu es plutôt... ===
    { type: 'E', category: 'couple', text: 'En vacances, tu es plutot...', option_a: 'Planification', option_b: 'Improvisation', timer: 10 },
    { type: 'E', category: 'couple', text: 'Apres une dispute, tu es plutot...', option_a: 'Besoin d\'en parler', option_b: 'Besoin de temps', timer: 10 },
    { type: 'E', category: 'sexy', text: 'Au lit, tu es plutot...', option_a: 'Dominant(e)', option_b: 'Soumis(e)', timer: 10 },
    { type: 'E', category: 'preferences', text: 'Pour exprimer l\'amour, tu es plutot...', option_a: 'Mots doux', option_b: 'Gestes/Actions', timer: 10 },
    { type: 'E', category: 'habitudes', text: 'Le dimanche, tu es plutot...', option_a: 'Grasse mat\'', option_b: 'Leve-tot productif', timer: 10 },
    { type: 'E', category: 'fun', text: 'En soiree, tu es plutot...', option_a: 'Vie de la fete', option_b: 'Petit comite', timer: 10 },
    { type: 'E', category: 'couple', text: 'Pour les decisions importantes, tu es plutot...', option_a: 'Tete', option_b: 'Coeur', timer: 10 },
    { type: 'E', category: 'preferences', text: 'Pour un cadeau, tu preferes...', option_a: 'Surprise', option_b: 'Choisir toi-meme', timer: 10 },

    // === TYPE F - Qui de nous deux ===
    { type: 'F', category: 'couple', text: 'Qui craque en premier apres une dispute ?', timer: 15 },
    { type: 'F', category: 'couple', text: 'Qui est le/la plus possessif/possessive ?', timer: 15 },
    { type: 'F', category: 'habitudes', text: 'Qui passe le plus de temps sur son telephone ?', timer: 15 },
    { type: 'F', category: 'couple', text: 'Qui est le/la plus romantique au quotidien ?', timer: 15 },
    { type: 'F', category: 'fun', text: 'Qui survivrait le plus longtemps sur une ile deserte ?', timer: 15 },
    { type: 'F', category: 'sexy', text: 'Qui initie le plus souvent les calins ?', timer: 15 },
    { type: 'F', category: 'habitudes', text: 'Qui est le/la plus depensier/depensiere ?', timer: 15 },
    { type: 'F', category: 'couple', text: 'Qui serait le plus triste si on se separait ?', timer: 15 },
    { type: 'F', category: 'fun', text: 'Qui est le/la meilleur(e) menteur/menteuse ?', timer: 15 },
    { type: 'F', category: 'couple', text: 'Qui est le/la plus attentionne(e) ?', timer: 15 },
    { type: 'F', category: 'habitudes', text: 'Qui oublie le plus souvent les dates importantes ?', timer: 15 },
    { type: 'F', category: 'sexy', text: 'Qui a le plus d\'imagination au lit ?', timer: 15 },

    // === Questions bonus originales ===
    { type: 'A', category: 'couple', text: 'Quelle serie Netflix je pourrais binge-watcher en un weekend ?', options: JSON.stringify(['Thriller', 'Comedie', 'Drame', 'Documentaire']), timer: 20 },
    { type: 'B', category: 'couple', text: 'Notre probleme principal a resoudre c\'est...', options: JSON.stringify(['La communication', 'Le temps ensemble', 'Les taches menageres', 'Rien de grave']), timer: 25 },
    { type: 'A', category: 'preferences', text: 'Mon langage de l\'amour principal c\'est...', options: JSON.stringify(['Paroles valorisantes', 'Moments de qualite', 'Cadeaux', 'Toucher physique']), timer: 20 },
    { type: 'B', category: 'coquin', text: 'Un fantasme qu\'on pourrait realiser ensemble ?', options: JSON.stringify(['Role play', 'Nouveau lieu', 'Jouets', 'On en parle apres']), timer: 25 },
    { type: 'C', category: 'couple', text: 'Ecris une chose que tu aimes chez moi que je ne soupconnee pas', timer: 30 },
    { type: 'F', category: 'fun', text: 'Qui ferait le meilleur parent ?', timer: 15 },
    { type: 'E', category: 'couple', text: 'Pour les retrouvailles apres une absence, tu preferes...', option_a: 'Calin intense', option_b: 'Discussion rattrapage', timer: 10 },
    { type: 'D', category: 'couple', text: 'A quel point notre vie sexuelle te satisfait ? (1-10)', timer: 15 },
    { type: 'B', category: 'projets', text: 'Le prochain gros achat ensemble ?', options: JSON.stringify(['Voyage', 'Meuble/Deco', 'Tech', 'Experience']), timer: 20 },
    { type: 'A', category: 'couple', text: 'Ce qui me ferait le plus plaisir la maintenant ?', options: JSON.stringify(['Un massage', 'Un compliment', 'Du temps seul(e)', 'Une sortie']), timer: 20 },

    // === 100 QUESTIONS SUPPLEMENTAIRES ===

    // Type A - Devine (25 questions)
    { type: 'A', category: 'couple', text: 'Quel est mon plus grand regret dans la vie ?', options: JSON.stringify(['Etudes/Carriere', 'Une relation passee', 'Un voyage rate', 'Rien de particulier']), timer: 20 },
    { type: 'A', category: 'couple', text: 'Qu\'est-ce qui me stresse le plus au quotidien ?', options: JSON.stringify(['Le travail', 'L\'argent', 'Le temps qui passe', 'Les relations sociales']), timer: 20 },
    { type: 'A', category: 'preferences', text: 'Quel serait mon job de reve ?', options: JSON.stringify(['Voyageur/Influenceur', 'Artiste', 'Chef d\'entreprise', 'Metier actuel']), timer: 20 },
    { type: 'A', category: 'habitudes', text: 'Qu\'est-ce que je fais quand je suis triste ?', options: JSON.stringify(['Je me renferme', 'J\'en parle', 'Je mange', 'Je sors']), timer: 20 },
    { type: 'A', category: 'couple', text: 'Quelle qualite j\'admire le plus chez toi ?', options: JSON.stringify(['Ta patience', 'Ton intelligence', 'Ta generosite', 'Ton humour']), timer: 20 },
    { type: 'A', category: 'souvenirs', text: 'Quel est mon meilleur souvenir d\'enfance ?', options: JSON.stringify(['Vacances famille', 'Anniversaire special', 'Moment avec amis', 'Reussite personnelle']), timer: 20 },
    { type: 'A', category: 'preferences', text: 'Quel reseau social j\'utilise le plus ?', options: JSON.stringify(['Instagram', 'TikTok', 'Twitter/X', 'Aucun vraiment']), timer: 15 },
    { type: 'A', category: 'habitudes', text: 'Combien de temps je passe sous la douche ?', options: JSON.stringify(['Moins de 5 min', '5-10 min', '10-20 min', 'Plus de 20 min']), timer: 15 },
    { type: 'A', category: 'couple', text: 'Qu\'est-ce qui me fait tomber amoureux/amoureuse ?', options: JSON.stringify(['L\'humour', 'L\'intelligence', 'La gentillesse', 'Le physique']), timer: 20 },
    { type: 'A', category: 'preferences', text: 'Quel type de musique j\'ecoute en cachette ?', options: JSON.stringify(['Pop commerciale', 'Rap', 'Variete francaise', 'Musique de film']), timer: 20 },
    { type: 'A', category: 'fun', text: 'Si j\'etais un emoji, ce serait lequel ?', options: JSON.stringify(['😂', '🥰', '😎', '🤔']), timer: 15 },
    { type: 'A', category: 'couple', text: 'Qu\'est-ce que je n\'oserais jamais te demander ?', options: JSON.stringify(['De l\'argent', 'Un service embarrassant', 'Une faveur intime', 'Un changement de look']), timer: 20 },
    { type: 'A', category: 'habitudes', text: 'Quelle est ma mauvaise habitude la plus agacante ?', options: JSON.stringify(['Telephone', 'Ronger ongles', 'Procrastiner', 'Laisser trainer mes affaires']), timer: 20 },
    { type: 'A', category: 'preferences', text: 'Mon guilty pleasure alimentaire c\'est...', options: JSON.stringify(['Fast food', 'Chocolat', 'Chips/Snacks', 'Glaces']), timer: 15 },
    { type: 'A', category: 'couple', text: 'Qu\'est-ce qui me ferait pleurer a coup sur ?', options: JSON.stringify(['Film triste', 'Dispute avec toi', 'Nostalgie', 'Histoire d\'animaux']), timer: 20 },
    { type: 'A', category: 'projets', text: 'Mon objectif de vie numero 1 c\'est...', options: JSON.stringify(['Famille heureuse', 'Reussite pro', 'Voyager le monde', 'Etre en bonne sante']), timer: 20 },
    { type: 'A', category: 'fun', text: 'Mon personnage de serie prefere est du genre...', options: JSON.stringify(['Heros courageux', 'Anti-heros complexe', 'Personnage drole', 'Le mechant']), timer: 20 },
    { type: 'A', category: 'habitudes', text: 'Qu\'est-ce que je fais quand je m\'ennuie ?', options: JSON.stringify(['Scroller mon tel', 'Manger', 'Dormir', 'Ranger/Nettoyer']), timer: 15 },
    { type: 'A', category: 'couple', text: 'Ce que j\'aimerais changer chez moi c\'est...', options: JSON.stringify(['Mon physique', 'Ma confiance', 'Mes habitudes', 'Rien']), timer: 20 },
    { type: 'A', category: 'preferences', text: 'Mon moment prefere de la journee c\'est...', options: JSON.stringify(['Le matin au reveil', 'La pause dejeuner', 'Le soir en rentrant', 'La nuit tard']), timer: 15 },
    { type: 'A', category: 'souvenirs', text: 'Le moment le plus embarrassant de ma vie c\'etait...', options: JSON.stringify(['A l\'ecole', 'Au travail', 'En famille', 'Avec toi']), timer: 20 },
    { type: 'A', category: 'couple', text: 'Ma facon de dire je t\'aime c\'est...', options: JSON.stringify(['Le dire', 'Des cadeaux', 'Des services', 'Du temps ensemble']), timer: 20 },
    { type: 'A', category: 'fun', text: 'Si je devais survivre avec un seul aliment ce serait...', options: JSON.stringify(['Pizza', 'Pates', 'Riz', 'Pain']), timer: 15 },
    { type: 'A', category: 'habitudes', text: 'Ce qui me reveille de bonne humeur c\'est...', options: JSON.stringify(['Soleil', 'Toi a cote', 'Rien a faire', 'Grasse matinee']), timer: 15 },
    { type: 'A', category: 'couple', text: 'Le defaut que tu as mais que j\'adore c\'est...', options: JSON.stringify(['Tetue', 'Bordélique', 'Bavard(e)', 'Gros(se) dormeur/dormeuse']), timer: 20 },

    // Type B - Repondez pareil (25 questions)
    { type: 'B', category: 'couple', text: 'Notre prochaine destination de reve ?', options: JSON.stringify(['Japon', 'Maldives', 'New York', 'Scandinavie']), timer: 20 },
    { type: 'B', category: 'projets', text: 'On aimerait apprendre ensemble...', options: JSON.stringify(['Une langue', 'La danse', 'La cuisine', 'Un sport']), timer: 20 },
    { type: 'B', category: 'couple', text: 'Notre faiblesse en tant que couple c\'est...', options: JSON.stringify(['La communication', 'Le temps ensemble', 'La routine', 'La jalousie']), timer: 20 },
    { type: 'B', category: 'habitudes', text: 'Notre activite preferee le dimanche ?', options: JSON.stringify(['Brunch', 'Netflix', 'Sport', 'Famille/amis']), timer: 20 },
    { type: 'B', category: 'fun', text: 'Notre spirit animal en tant que couple c\'est...', options: JSON.stringify(['Pingouins', 'Loups', 'Pandas', 'Chats']), timer: 15 },
    { type: 'B', category: 'projets', text: 'Si on faisait un podcast ensemble, ce serait sur...', options: JSON.stringify(['Relations', 'Voyage', 'True crime', 'Comedie']), timer: 20 },
    { type: 'B', category: 'couple', text: 'Ce qui rend notre couple unique c\'est...', options: JSON.stringify(['Notre humour', 'Notre histoire', 'Notre complicite', 'Notre difference']), timer: 20 },
    { type: 'B', category: 'habitudes', text: 'Notre routine preferee c\'est...', options: JSON.stringify(['Petit dej au lit', 'Serie le soir', 'Sport ensemble', 'Cuisine ensemble']), timer: 20 },
    { type: 'B', category: 'fun', text: 'Si on participait a une emission TV ce serait...', options: JSON.stringify(['Pekin Express', 'Fort Boyard', 'Top Chef', 'Koh Lanta']), timer: 20 },
    { type: 'B', category: 'projets', text: 'Notre prochain defi ensemble ?', options: JSON.stringify(['Marathon', 'Voyage sac a dos', 'Apprendre quelque chose', 'Economiser pour X']), timer: 20 },
    { type: 'B', category: 'couple', text: 'La chose qu\'on devrait faire plus souvent ?', options: JSON.stringify(['Sortir en date', 'Voyager', 'Se surprendre', 'Communiquer']), timer: 20 },
    { type: 'B', category: 'habitudes', text: 'Notre plat signature a cuisiner ensemble ?', options: JSON.stringify(['Pasta', 'Curry', 'Pizza maison', 'Barbecue']), timer: 20 },
    { type: 'B', category: 'fun', text: 'Notre chanson de couple devrait etre...', options: JSON.stringify(['Un slow', 'Un tube de l\'ete', 'Une chanson retro', 'On n\'a pas besoin']), timer: 20 },
    { type: 'B', category: 'projets', text: 'Dans 5 ans on aura...', options: JSON.stringify(['Demenage', 'Un animal', 'Un enfant', 'Tout pareil']), timer: 20 },
    { type: 'B', category: 'couple', text: 'Notre date la plus memorable c\'etait...', options: JSON.stringify(['Le premier rdv', 'Un voyage', 'Une surprise', 'Un moment simple']), timer: 20 },
    { type: 'B', category: 'fun', text: 'Si on etait dans un film ce serait un...', options: JSON.stringify(['Romcom', 'Aventure', 'Drame', 'Comedie']), timer: 15 },
    { type: 'B', category: 'projets', text: 'Le reve qu\'on partage c\'est...', options: JSON.stringify(['Maison avec jardin', 'Tour du monde', 'Ouvrir un business', 'Vie simple']), timer: 20 },
    { type: 'B', category: 'couple', text: 'Ce qu\'on aime faire ensemble sans parler ?', options: JSON.stringify(['Regarder un film', 'Se promener', 'Cuisiner', 'Juste etre la']), timer: 20 },
    { type: 'B', category: 'habitudes', text: 'Notre tradition de couple preferee ?', options: JSON.stringify(['Resto mensuel', 'Weekend surprise', 'Film du dimanche', 'On n\'en a pas encore']), timer: 20 },
    { type: 'B', category: 'fun', text: 'Le sport qu\'on devrait essayer ensemble ?', options: JSON.stringify(['Escalade', 'Danse', 'Yoga', 'Paddle']), timer: 15 },
    { type: 'B', category: 'couple', text: 'Notre point fort en communication c\'est...', options: JSON.stringify(['L\'ecoute', 'L\'honneteté', 'L\'humour', 'La patience']), timer: 20 },
    { type: 'B', category: 'projets', text: 'Si on gagnait 10000€ on...', options: JSON.stringify(['Voyage', 'Epargne', 'Shopping folie', 'Investir']), timer: 20 },
    { type: 'B', category: 'fun', text: 'Notre emoji de couple devrait etre...', options: JSON.stringify(['❤️', '🔥', '😜', '🥰']), timer: 15 },
    { type: 'B', category: 'couple', text: 'La meilleure surprise qu\'on s\'est faite c\'etait...', options: JSON.stringify(['Un voyage', 'Un cadeau', 'Une declaration', 'Un moment spontane']), timer: 20 },
    { type: 'B', category: 'habitudes', text: 'Notre jeu de societe prefere ?', options: JSON.stringify(['Jeux de cartes', 'Quiz', 'Jeux de plateau', 'Jeux video']), timer: 15 },

    // Type C - Ouvertes (15 questions)
    { type: 'C', category: 'couple', text: 'Qu\'est-ce que tu changerais dans notre premiere rencontre ?', timer: 30 },
    { type: 'C', category: 'couple', text: 'Ecris le message que tu m\'enverrais si on se rencontrait aujourd\'hui sur Tinder', timer: 30 },
    { type: 'C', category: 'souvenirs', text: 'Quel moment tu voudrais revivre avec moi ?', timer: 25 },
    { type: 'C', category: 'projets', text: 'Si tu pouvais m\'offrir n\'importe quoi sans limite de budget ?', timer: 25 },
    { type: 'C', category: 'couple', text: 'Quelle est ta plus grande peur concernant notre couple ?', timer: 30 },
    { type: 'C', category: 'fun', text: 'Si on avait un groupe de musique, on s\'appellerait comment ?', timer: 25 },
    { type: 'C', category: 'couple', text: 'Qu\'est-ce que tu n\'as jamais dit a personne mais que tu peux me dire ?', timer: 30 },
    { type: 'C', category: 'projets', text: 'Notre bucket list couple en 3 points ?', timer: 30 },
    { type: 'C', category: 'couple', text: 'Decris-moi ta journee ideale avec moi', timer: 30 },
    { type: 'C', category: 'souvenirs', text: 'Quel est le fou rire qu\'on a eu ensemble dont tu te souviens ?', timer: 25 },
    { type: 'C', category: 'couple', text: 'Quelle est la chose la plus romantique qu\'on devrait faire ?', timer: 25 },
    { type: 'C', category: 'fun', text: 'Invente un mot qui nous definirait en tant que couple', timer: 25 },
    { type: 'C', category: 'couple', text: 'Si tu devais resumer notre histoire en une phrase ?', timer: 30 },
    { type: 'C', category: 'projets', text: 'Ou tu nous vois vieillir ensemble ?', timer: 25 },
    { type: 'C', category: 'couple', text: 'Qu\'est-ce que tu voudrais que je sache mais que tu n\'oses pas dire ?', timer: 30 },

    // Type D - Echelle (10 questions)
    { type: 'D', category: 'couple', text: 'A quel point notre couple est solide selon toi ? (1-10)', timer: 15 },
    { type: 'D', category: 'couple', text: 'A quel point tu es heureux/heureuse avec moi ? (1-10)', timer: 15 },
    { type: 'D', category: 'habitudes', text: 'A quel point tu supportes le silence entre nous ? (1-10)', timer: 15 },
    { type: 'D', category: 'couple', text: 'A quel point tu te sens libre dans cette relation ? (1-10)', timer: 15 },
    { type: 'D', category: 'fun', text: 'A quel point tu es accro a moi ? (1-10)', timer: 15 },
    { type: 'D', category: 'couple', text: 'A quel point tu as confiance en notre avenir ? (1-10)', timer: 15 },
    { type: 'D', category: 'habitudes', text: 'A quel point tu es independant(e) dans le couple ? (1-10)', timer: 15 },
    { type: 'D', category: 'couple', text: 'A quel point tu te sens compris(e) par moi ? (1-10)', timer: 15 },
    { type: 'D', category: 'fun', text: 'A quel point tu me trouves drole ? (1-10)', timer: 15 },
    { type: 'D', category: 'couple', text: 'A quel point notre relation t\'a fait grandir ? (1-10)', timer: 15 },

    // Type E - Plutot (15 questions)
    { type: 'E', category: 'couple', text: 'Pour une dispute, tu preferes...', option_a: 'Regler sur le moment', option_b: 'Dormir dessus', timer: 10 },
    { type: 'E', category: 'preferences', text: 'Vacances tu preferes...', option_a: 'All inclusive relax', option_b: 'Aventure backpack', timer: 10 },
    { type: 'E', category: 'couple', text: 'En amour tu es plutot...', option_a: 'Raison', option_b: 'Passion', timer: 10 },
    { type: 'E', category: 'habitudes', text: 'Pour les taches menageres...', option_a: 'Planning strict', option_b: 'Quand ca vient', timer: 10 },
    { type: 'E', category: 'fun', text: 'Entre nous deux, tu serais plutot...', option_a: 'Le cerveau', option_b: 'Le coeur', timer: 10 },
    { type: 'E', category: 'couple', text: 'Pour les compliments tu preferes...', option_a: 'En recevoir', option_b: 'En donner', timer: 10 },
    { type: 'E', category: 'preferences', text: 'Soiree en couple...', option_a: 'Sortie en ville', option_b: 'Cocooning maison', timer: 10 },
    { type: 'E', category: 'couple', text: 'Dans une relation tu es plutot...', option_a: 'Celui/Celle qui protege', option_b: 'Celui/Celle qui est protege(e)', timer: 10 },
    { type: 'E', category: 'habitudes', text: 'Pour les decisions importantes...', option_a: 'Reflechir longtemps', option_b: 'Decider vite', timer: 10 },
    { type: 'E', category: 'fun', text: 'Si on se perd en voyage...', option_a: 'GPS direct', option_b: 'Aventure on trouve', timer: 10 },
    { type: 'E', category: 'couple', text: 'Pour exprimer ta colere...', option_a: 'Tu exploses', option_b: 'Tu te fermes', timer: 10 },
    { type: 'E', category: 'preferences', text: 'Film du soir...', option_a: 'Tu choisis', option_b: 'Je choisis', timer: 10 },
    { type: 'E', category: 'couple', text: 'Dans le couple tu es plutot...', option_a: 'Planificateur/trice', option_b: 'Spontane(e)', timer: 10 },
    { type: 'E', category: 'habitudes', text: 'Quand tu rentres du travail...', option_a: 'Tu veux parler', option_b: 'Tu veux du calme', timer: 10 },
    { type: 'E', category: 'fun', text: 'Entre cadeau ou experience...', option_a: 'Un bel objet', option_b: 'Un moment vecu', timer: 10 },

    // Type F - Qui de nous deux (10 questions)
    { type: 'F', category: 'couple', text: 'Qui a le dernier mot dans une dispute ?', timer: 15 },
    { type: 'F', category: 'fun', text: 'Qui serait le plus nul en camping sauvage ?', timer: 15 },
    { type: 'F', category: 'habitudes', text: 'Qui est le plus accro a son telephone ?', timer: 15 },
    { type: 'F', category: 'couple', text: 'Qui fait le plus d\'efforts pour l\'autre ?', timer: 15 },
    { type: 'F', category: 'fun', text: 'Qui gagnerait une battle de danse ?', timer: 15 },
    { type: 'F', category: 'habitudes', text: 'Qui mange le plus de cochonneries ?', timer: 15 },
    { type: 'F', category: 'couple', text: 'Qui est le plus fleur bleue ?', timer: 15 },
    { type: 'F', category: 'fun', text: 'Qui tiendrait le plus longtemps sans parler ?', timer: 15 },
    { type: 'F', category: 'couple', text: 'Qui a change le plus depuis qu\'on est ensemble ?', timer: 15 },
    { type: 'F', category: 'habitudes', text: 'Qui est le plus tetu quand il a raison ?', timer: 15 },

    // === 20 QUESTIONS TRES COQUINES ===
    { type: 'E', category: 'coquin', text: 'Tu preferes...', option_a: 'Lumiere allumee', option_b: 'Dans le noir', timer: 10 },
    { type: 'E', category: 'coquin', text: 'Tu preferes...', option_a: 'Matin calme', option_b: 'Nuit torride', timer: 10 },
    { type: 'E', category: 'coquin', text: 'Tu preferes...', option_a: 'Lent et sensuel', option_b: 'Rapide et intense', timer: 10 },
    { type: 'E', category: 'coquin', text: 'Tu preferes...', option_a: 'Donner du plaisir', option_b: 'Recevoir du plaisir', timer: 10 },
    { type: 'F', category: 'coquin', text: 'Qui est le/la plus entreprenant(e) au lit ?', timer: 15 },
    { type: 'F', category: 'coquin', text: 'Qui fait le plus de bruit pendant l\'acte ?', timer: 15 },
    { type: 'F', category: 'coquin', text: 'Qui s\'endort le plus vite apres ?', timer: 15 },
    { type: 'F', category: 'coquin', text: 'Qui a les fantasmes les plus fous ?', timer: 15 },
    { type: 'D', category: 'coquin', text: 'A quel point tu es satisfait(e) de notre vie sexuelle ? (1-10)', timer: 15 },
    { type: 'D', category: 'coquin', text: 'A quel point tu es ouvert(e) a essayer de nouvelles choses au lit ? (1-10)', timer: 15 },
    { type: 'D', category: 'coquin', text: 'A quel point le sexe est important pour toi dans le couple ? (1-10)', timer: 15 },
    { type: 'D', category: 'coquin', text: 'A quel point tu te sens desirable par ton/ta partenaire ? (1-10)', timer: 15 },
    { type: 'C', category: 'coquin', text: 'Decris ton fantasme ultime en une phrase', timer: 30 },
    { type: 'C', category: 'coquin', text: 'Quel endroit insolite tu voudrais essayer avec moi ?', timer: 25 },
    { type: 'C', category: 'coquin', text: 'Qu\'est-ce que tu n\'as jamais ose me demander au lit ?', timer: 30 },
    { type: 'C', category: 'coquin', text: 'Quelle tenue tu voudrais me voir porter ?', timer: 25 },
    { type: 'B', category: 'coquin', text: 'Notre frequence ideale ce serait...', options: JSON.stringify(['Tous les jours', '3-4x/semaine', '1-2x/semaine', 'Quand ca vient']), timer: 20 },
    { type: 'B', category: 'coquin', text: 'On devrait essayer...', options: JSON.stringify(['Nouveaux lieux', 'Accessoires', 'Role play', 'On est bien comme ca']), timer: 20 },
    { type: 'A', category: 'coquin', text: 'Ma zone erogene preferee c\'est...', options: JSON.stringify(['Le cou', 'Les oreilles', 'Le dos', 'Les cuisses']), timer: 15 },
    { type: 'A', category: 'coquin', text: 'Ce qui m\'excite le plus chez toi c\'est...', options: JSON.stringify(['Ton regard', 'Ta voix', 'Tes mains', 'Ton odeur']), timer: 15 }
  ];

  const insert = db.prepare(`
    INSERT INTO questions (type, category, text, options, option_a, option_b, timer, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const q of questions) {
    insert.run(
      q.type,
      q.category,
      q.text,
      q.options || null,
      q.option_a || null,
      q.option_b || null,
      q.timer
    );
  }

  console.log(`Inserted ${questions.length} default questions`);
}

export function cleanupExpiredRooms() {
  const result = db.prepare(`
    DELETE FROM rooms
    WHERE datetime(last_activity) < datetime('now', '-7 days')
  `).run();

  if (result.changes > 0) {
    console.log(`Cleaned up ${result.changes} expired rooms`);
  }
}
