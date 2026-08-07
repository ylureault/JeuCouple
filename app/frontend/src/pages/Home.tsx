import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, type Transition } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';
import MuteButton from '../components/MuteButton';
import ThemeSelector from '../components/ThemeSelector';
import GameModeSelector from '../components/GameModeSelector';
import { consulterSalon, traduireErreur } from '../lib/salon';
import type { Gender, GameMode } from '../../../shared/types';

type Mode = 'home' | 'create' | 'join' | 'thematic';

/**
 * U2 — LES TRANSITIONS D'ECRAN DURAIENT 3 A 4 SECONDES.
 *
 * Deux causes cumulees :
 *  1. `transition={{ type: 'spring', damping: 20 }}` sans raideur : le ressort
 *     par defaut est sous-amorti, il oscille et met plus d'une seconde a se
 *     poser — sur CHAQUE bloc, et les blocs s'enchainent.
 *  2. `<AnimatePresence mode="wait">` : l'ecran suivant n'est monte qu'une fois
 *     la sortie du precedent TERMINEE. Deux ressorts d'affilee, donc.
 * L'utilisateur voyait une page vide et cliquait deux fois.
 *
 * On passe a des durees fixes et courtes : sortie 100 ms, entree 160 ms, soit
 * 260 ms bout en bout. Les boutons du nouvel ecran sont dans le DOM des le
 * premier frame de l'entree (l'opacite n'empeche pas le clic), donc cliquables
 * immediatement.
 */
const ENTREE_ECRAN: Transition = { duration: 0.16, ease: [0.16, 1, 0.3, 1] };
const SORTIE_ECRAN: Transition = { duration: 0.1, ease: 'easeIn' };
/** Deplacement d'entree volontairement minuscule : au-dela, ca "vole". */
const ENTREE_DEPUIS = { opacity: 0, y: 10 };
const SORTIE_VERS = { opacity: 0, y: -8 };

// Thematic game configuration - explicit themes
const THEMATIC_THEMES = [
  { id: 'mix_all', label: 'Mix de TOUT', emoji: '🎲', description: 'Tous les thèmes du jeu mélangés — tendre, culture générale, coquin, profond', color: 'from-indigo-500 to-purple-600' },
  { id: 'fantasmes', label: 'Fantasmes', emoji: '💭', description: 'Vos désirs secrets et inavoués', color: 'from-violet-500 to-purple-600' },
  { id: 'preliminaires', label: 'Préliminaires', emoji: '💋', description: "L'art de faire monter le désir", color: 'from-red-400 to-pink-600' },
  { id: 'kamasutra', label: 'Kamasutra', emoji: '🧘', description: 'Positions et techniques', color: 'from-amber-500 to-orange-600' },
  { id: 'fellation', label: 'Fellation', emoji: '👄', description: 'Plaisirs oraux masculins', color: 'from-pink-500 to-rose-600' },
  { id: 'cunnilingus', label: 'Cunnilingus', emoji: '👅', description: 'Plaisirs oraux féminins', color: 'from-pink-400 to-fuchsia-600' },
  { id: '69', label: 'Position 69', emoji: '🔄', description: 'Plaisir mutuel simultané', color: 'from-purple-500 to-indigo-600' },
  { id: 'sodomie', label: 'Sodomie', emoji: '🍑', description: 'Le plaisir anal', color: 'from-orange-500 to-red-600' },
  { id: 'jeux_role', label: 'Jeux de rôle', emoji: '🎭', description: 'Scénarios et personnages coquins', color: 'from-emerald-500 to-teal-600' },
  { id: 'bdsm', label: 'BDSM', emoji: '⛓️', description: 'Domination, soumission et plus', color: 'from-gray-700 to-gray-900' },
  { id: 'public', label: 'Sexe en public', emoji: '🏖️', description: 'Oser en dehors de la chambre', color: 'from-sky-500 to-blue-600' },
  { id: 'extreme', label: 'Ultra coquin', emoji: '🔞', description: 'Pour les couples très audacieux', color: 'from-red-600 to-rose-700' },
  { id: 'mix_hot', label: 'Mix Torride', emoji: '🔥', description: 'Un mélange de tous les thèmes osés, à l\'intensité que vous choisissez', color: 'from-orange-500 to-red-500' },
] as const;

/**
 * Échelle d'intensité du Mix Torride, de 1 à 10.
 *
 * « Torride » ne veut pas dire la même chose pour tout le monde, et le mélange
 * servait jusqu'ici les onze thèmes d'un bloc : un couple qui voulait chauffer
 * doucement tombait sur le BDSM à la deuxième manche. Chaque cran ajoute un
 * thème au précédent — le curseur ne remplace pas, il ouvre. Le niveau 1 reste
 * jouable seul : « Préliminaires » compte une soixantaine de questions.
 */
const PALIERS_TORRIDES: { ajoute: string[]; titre: string }[] = [
  { ajoute: ['preliminaires'], titre: 'Tout en douceur' },
  { ajoute: ['fantasmes'], titre: 'On se confie' },
  { ajoute: ['kamasutra'], titre: 'Ça chauffe' },
  { ajoute: ['fellation', 'cunnilingus'], titre: 'Sans détour' },
  { ajoute: ['69'], titre: 'À deux, à fond' },
  { ajoute: ['jeux_role'], titre: 'On joue un rôle' },
  { ajoute: ['public'], titre: 'Hors de la chambre' },
  { ajoute: ['sodomie'], titre: 'Plus loin' },
  { ajoute: ['bdsm'], titre: 'Jeux de pouvoir' },
  { ajoute: ['extreme'], titre: 'Sans limites' },
];

const TORRIDE_MIN = 1;
const TORRIDE_MAX = PALIERS_TORRIDES.length;

/** Tous les thèmes ouverts jusqu'au niveau demandé, le plus doux en premier. */
function themesTorrides(niveau: number): string[] {
  return PALIERS_TORRIDES.slice(0, niveau).flatMap(p => p.ajoute);
}

// Category configuration with display info
const CATEGORY_CONFIG = [
  { id: 'couple', label: 'Couple', emoji: '💑' },
  { id: 'sexy', label: 'Sexy', emoji: '🔥' },
  { id: 'coquin', label: 'Coquin', emoji: '😈' },
  { id: 'habitudes', label: 'Habitudes', emoji: '🏠' },
  { id: 'souvenirs', label: 'Souvenirs', emoji: '📸' },
  { id: 'projets', label: 'Projets', emoji: '🎯' },
  { id: 'fun', label: 'Fun', emoji: '🎉' },
  { id: 'preferences', label: 'Goûts', emoji: '⭐' },
  { id: 'profond', label: 'Profond', emoji: '💭' },
  { id: 'culture', label: 'Culture générale', emoji: '🧠' },
  { id: 'intime', label: 'Intimité', emoji: '🕯️' },
  { id: 'oser_dire', label: 'Oser le dire', emoji: '🕊️' },
] as const;

/**
 * U9 — aucune categorie n'etait cochee au depart : douze pastilles grises, et
 * personne pour dire si "rien de coche" voulait dire "tout" ou "rien".
 * L'etat par defaut est donc TOUT COCHE, visible a l'oeil nu.
 * Au moment de creer la partie, une selection complete est renvoyee au serveur
 * sous forme de liste VIDE : cote serveur, vide = tout le catalogue, y compris
 * les categories thematiques qui n'ont pas de pastille ici.
 */
const TOUTES_CATEGORIES: string[] = CATEGORY_CONFIG.map((c) => c.id);

// Question type configuration
const TYPE_CONFIG = [
  { id: 'A', label: 'QCM', emoji: '🎯', desc: 'Devine ton partenaire' },
  { id: 'B', label: 'Commun', emoji: '🤝', desc: 'Même question' },
  { id: 'C', label: 'Texte', emoji: '✍️', desc: 'Réponse libre' },
  { id: 'D', label: 'Échelle', emoji: '📊', desc: 'Note 1-10' },
  { id: 'E', label: 'Binaire', emoji: '⚖️', desc: 'Choix A ou B' },
  { id: 'F', label: 'Qui?', emoji: '👫', desc: 'Toi ou moi' },
  { id: 'G', label: 'Vrai/Faux', emoji: '✅', desc: 'Deviner' },
  { id: 'H', label: 'Culture', emoji: '🧠', desc: 'Quiz général' },
] as const;

export default function Home() {
  const [mode, setMode] = useState<Mode>('home');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [gender, setGender] = useState<Gender | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(TOUTES_CATEGORIES);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>('mix_all');
  // Intensite du Mix Torride. Milieu d'echelle par defaut : ni tiede, ni brutal.
  const [niveauTorride, setNiveauTorride] = useState(5);
  // Partie rapide : un geste, zero reglage — mix de tout le catalogue.
  // C'est le chemin par defaut du jeu : il ne tourne PAS autour du sexe.
  const [quickStart, setQuickStart] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('classic');
  // Message propre a l'ecran Rejoindre (code inconnu, salon complet). Il prime
  // sur l'erreur du contexte, qui est plus generique.
  const [joinError, setJoinError] = useState<string | null>(null);
  const { createRoom, joinRoom, error, connected, reconnecting, clearError } = useGame();
  const { playSound } = useAudio();
  const navigate = useNavigate();
  const location = useLocation();

  // Handle join link redirect
  useEffect(() => {
    const state = location.state as { joinCode?: string } | null;
    if (state?.joinCode) {
      setRoomCode(state.joinCode);
      setMode('join');
      // Clear the state to prevent re-triggering
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  /**
   * Tout coche == aucune restriction. On envoie donc une liste vide plutot que
   * les douze codes : le serveur sert alors AUSSI les categories thematiques,
   * absentes de cette liste (voir TOUTES_CATEGORIES).
   */
  const categoriesPourServeur = (): string[] =>
    selectedCategories.length === TOUTES_CATEGORIES.length ? [] : selectedCategories;

  /**
   * U7 — un bouton grise sans un mot d'explication se lit comme une panne.
   * Cette fonction dit, en une phrase, ce qui manque encore. `null` = tout va
   * bien, le bouton est actif.
   */
  const raisonCreationBloquee = (): string | null => {
    if (!connected) return 'Connexion au serveur en cours…';
    if (!playerName.trim()) return 'Entre ton prénom pour continuer';
    if (!gender) return 'Indique si tu es une femme ou un homme';
    if (!quickStart && selectedCategories.length === 0) return 'Choisis au moins une catégorie';
    return null;
  };

  const raisonThematiqueBloquee = (): string | null => {
    if (!connected) return 'Connexion au serveur en cours…';
    if (!playerName.trim()) return 'Entre ton prénom pour continuer';
    if (!gender) return 'Indique si tu es une femme ou un homme';
    if (!selectedTheme) return 'Choisis un thème pour lancer la partie';
    return null;
  };

  const raisonRejoindreBloquee = (): string | null => {
    if (!connected) return 'Connexion au serveur en cours…';
    if (!playerName.trim()) return 'Entre ton prénom pour continuer';
    if (!gender) return 'Indique si tu es une femme ou un homme';
    if (roomCode.trim().length < 6) return 'Saisis les 6 chiffres du code du salon';
    return null;
  };

  const handleCreate = async () => {
    if (raisonCreationBloquee()) return;
    if (!gender) return;   // redondant, mais c'est lui qui convainc TypeScript
    setLoading(true);
    playSound('click');
    try {
      // Pass selected categories and types (empty array = all / auto mode)
      const code = await createRoom(
        playerName.trim(), gender,
        quickStart ? 10 : questionCount,
        quickStart ? [] : categoriesPourServeur(),
        quickStart ? [] : selectedTypes,
        quickStart ? 'mix' : gameMode
      );
      // Navigate to lobby with the actual room code
      navigate(`/salon/${code}`);
    } catch {
      // Error handled in context
    } finally {
      setLoading(false);
    }
  };

  const handleCreateThematic = async () => {
    if (!playerName.trim() || !gender || !connected || !selectedTheme) return;
    setLoading(true);
    playSound('click');
    try {
      // mix_all = aucune restriction (tout le catalogue) ;
      // mix_hot = les themes oses ouverts jusqu'au niveau du curseur ;
      // sinon, le theme choisi et lui seul.
      const themeCategories = selectedTheme === 'mix_all'
        ? []
        : selectedTheme === 'mix_hot'
          ? themesTorrides(niveauTorride)
          : [selectedTheme];
      const code = await createRoom(playerName.trim(), gender, questionCount, themeCategories, [], gameMode);
      navigate(`/salon/${code}`);
    } catch {
      // Error handled in context
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  const toggleType = (typeId: string) => {
    setSelectedTypes(prev =>
      prev.includes(typeId)
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    );
  };

  const handleJoin = async () => {
    // Le garde `connected` manquait ici : hors connexion le bouton "Rejoindre"
    // partait dans le vide et laissait le spinner tourner pour toujours.
    if (!playerName.trim() || !roomCode.trim() || !gender || !connected) return;
    const code = roomCode.trim().toUpperCase();
    setLoading(true);
    setJoinError(null);
    clearError();
    playSound('click');
    try {
      // SALON FANTOME (B6) : on demande d'abord au serveur si ce code existe.
      // Un code inconnu se solde par un message clair, et surtout par AUCUNE
      // tentative d'entree — rejoindre n'a jamais eu le droit de creer une
      // partie. Si le serveur ne repond pas (etat null), on laisse la tentative
      // suivre son cours : c'est lui l'arbitre, pas cette verification.
      const etat = await consulterSalon(code);
      if (etat && !etat.exists) {
        setJoinError('Aucune partie avec ce code. Vérifie le code ou crée une partie.');
        return;
      }
      if (etat && !etat.joinable) {
        setJoinError('Partie introuvable ou déjà complète');
        return;
      }

      const codeRejoint = await joinRoom(code, playerName.trim(), gender);
      // Ceinture et bretelles : sans code confirme par le serveur, on ne bouge
      // pas. Naviguer "au cas ou" est precisement ce qui fabriquait un salon
      // dans lequel personne n'etait jamais entre.
      if (!codeRejoint) {
        setJoinError('Aucune partie avec ce code. Vérifie le code ou crée une partie.');
        return;
      }
      navigate(`/salon/${codeRejoint}`);
    } catch (e) {
      setJoinError(traduireErreur(e instanceof Error ? e.message : null));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    playSound('click');
    // Une banniere d'erreur laissee d'un ecran a l'autre fait croire a un
    // probleme qui n'existe plus.
    setJoinError(null);
    clearError();
    setMode(newMode);
  };

  const { theme } = useTheme();
  const messageErreur = joinError ?? traduireErreur(error);

  return (
    <div className={`min-h-[100dvh] bg-gradient-to-br ${theme.colors.background} flex flex-col overflow-y-auto`}>
      <MuteButton />
      <ThemeSelector />

      {/* Floating hearts background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-4xl opacity-10"
            initial={{ y: '100vh', x: `${15 + i * 15}%` }}
            animate={{
              y: '-10vh',
              rotate: [0, 20, -20, 0],
            }}
            transition={{
              duration: 15 + i * 2,
              repeat: Infinity,
              delay: i * 2,
              ease: 'linear',
            }}
          >
            💕
          </motion.div>
        ))}
      </div>

      {/* U1 — bandeau d'erreur sorti du flux.
          POURQUOI : pose entre le titre et les boutons, il decalait tout le
          bas de la page a chaque apparition. En surcouche fixe, il informe
          sans jamais deplacer une cible sous le doigt. */}
      <AnimatePresence>
        {messageErreur && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={ENTREE_ECRAN}
            className="fixed top-[68px] left-1/2 -translate-x-1/2 z-50 w-[min(28rem,calc(100vw-2rem))]
                       bg-[#e21b3c] rounded-xl px-5 py-3 shadow-2xl"
            role="alert"
          >
            <p className="text-white font-bold text-center">{messageErreur}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      {/* U4 — sur desktop tout etait tasse en haut et 60 % de la page restait
          vide : on centre verticalement (justify-center + my-auto) et on
          elargit les cartes au-dela de 768 px. */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 py-6 md:py-8 relative z-10">
        {/* Logo and title */}
        <motion.div
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={ENTREE_ECRAN}
          className={`text-center transition-all ${mode === 'home' ? 'mb-4' : 'mb-3'}`}
        >
          <motion.div
            className={`${mode === 'home' ? 'text-6xl md:text-7xl mb-2' : 'text-3xl mb-1'} transition-all`}
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatType: 'reverse',
            }}
          >
            💑
          </motion.div>
          <h1 className={`${mode === 'home' ? 'text-4xl md:text-5xl mb-1' : 'text-2xl mb-0'} font-black text-white drop-shadow-[0_2px_10px_rgba(0,0,0,.45)] transition-all`}>
            Jeu Couples
          </h1>
          {/* Le sous-titre est toujours rendu sur l'accueil : c'est le badge
              au-dessous qui bougeait, pas lui. */}
          {mode === 'home' && (
            <p className="text-lg text-white/80 font-semibold">
              Testez votre complicité !
            </p>
          )}
        </motion.div>

        {/* U1 — LE BADGE DE CONNEXION FAISAIT SAUTER TOUTE LA PAGE.
            POURQUOI : il etait dans le flux et apparaissait/disparaissait au
            gre de l'etat du socket ; le sous-titre et les quatre boutons
            descendaient puis remontaient d'une soixantaine de pixels, et le
            clic partait sur le mauvais bouton — sur mobile, c'est la mauvaise
            partie qui se lance.
            CORRECTIF : une piste de hauteur FIXE (44 px) reservee en
            permanence. Le badge vit dedans, s'affiche ou non, change de texte
            et de couleur : la piste, elle, ne bouge jamais d'un pixel. */}
        <div className="h-11 flex items-center justify-center mb-3 shrink-0"
             aria-live="polite" data-test="badge-connexion">
          {mode === 'home' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={ENTREE_ECRAN}
              className={`rounded-full px-4 py-2 flex items-center gap-2 ${
                connected
                  ? 'bg-green-500/20 border border-green-400/50'
                  : reconnecting
                    ? 'bg-red-500/20 border border-red-400/60'
                    : 'bg-yellow-500/20 border border-yellow-400/50'
              }`}
            >
              <div className={`w-3 h-3 rounded-full animate-pulse ${
                connected ? 'bg-green-400' : reconnecting ? 'bg-red-400' : 'bg-yellow-400'
              }`} />
              <p className="text-white text-sm font-medium whitespace-nowrap">
                {/* Distinguer "je me connecte" de "j'ai perdu la connexion" : le
                    joueur doit savoir si les boutons sont grises pour une seconde
                    ou parce que le serveur ne repond plus. */}
                {connected ? 'Connecté' : reconnecting ? 'Connexion perdue : reconnexion…' : 'Connexion…'}
              </p>
            </motion.div>
          )}
        </div>

        {/* Main buttons / forms */}
        <AnimatePresence mode="wait">
          {mode === 'home' && (
            <motion.div
              key="home"
              initial={ENTREE_DEPUIS}
              animate={{ opacity: 1, y: 0 }}
              exit={{ ...SORTIE_VERS, transition: SORTIE_ECRAN }}
              transition={ENTREE_ECRAN}
              className="w-full max-w-md md:max-w-lg space-y-3 md:space-y-4"
            >
              {/* B5 : `disabled` et non un simple style. Un bouton qui a l'air
                  cliquable mais ne fait rien est le pire des deux mondes : le
                  joueur clique dix fois sans comprendre. Grise + curseur
                  interdit + inerte pour le clavier et le lecteur d'ecran. */}
              <motion.button
                onClick={() => { if (connected) { setQuickStart(true); switchMode('create'); } }}
                disabled={!connected}
                aria-disabled={!connected}
                className={`btn-start w-full md:py-5 md:text-2xl ${!connected ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                whileHover={connected ? { scale: 1.02 } : {}}
                whileTap={connected ? { scale: 0.98 } : {}}
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-2xl">⚡</span>
                  Partie rapide
                </span>
                <span className="block text-[11px] font-semibold text-white/80 mt-0.5">
                  Tous les thèmes mélangés, on joue tout de suite
                </span>
              </motion.button>

              <motion.button
                onClick={() => { if (connected) { setQuickStart(false); switchMode('create'); } }}
                disabled={!connected}
                aria-disabled={!connected}
                className={`btn-create w-full md:py-5 md:text-xl ${!connected ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                whileHover={connected ? { scale: 1.02 } : {}}
                whileTap={connected ? { scale: 0.98 } : {}}
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-2xl">🎮</span>
                  Créer une partie
                </span>
              </motion.button>

              <motion.button
                onClick={() => connected && switchMode('thematic')}
                disabled={!connected}
                aria-disabled={!connected}
                className={`w-full py-3 md:py-4 px-6 rounded-xl font-bold md:text-lg text-white bg-gradient-to-r from-pink-500 to-rose-600 shadow-lg ${!connected ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                whileHover={connected ? { scale: 1.02 } : {}}
                whileTap={connected ? { scale: 0.98 } : {}}
              >
                <span className="flex items-center justify-center gap-2">
                  <span className="text-xl">🔞</span>
                  <span className="text-base">Partie thématique osée</span>
                </span>
              </motion.button>

              <motion.button
                onClick={() => connected && switchMode('join')}
                disabled={!connected}
                aria-disabled={!connected}
                className={`btn-join w-full md:py-5 md:text-xl ${!connected ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                whileHover={connected ? { scale: 1.02 } : {}}
                whileTap={connected ? { scale: 0.98 } : {}}
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-2xl">🔗</span>
                  Rejoindre avec un code
                </span>
              </motion.button>
            </motion.div>
          )}

          {mode === 'create' && (
            <motion.div
              key="create"
              initial={ENTREE_DEPUIS}
              animate={{ opacity: 1, y: 0 }}
              exit={{ ...SORTIE_VERS, transition: SORTIE_ECRAN }}
              transition={ENTREE_ECRAN}
              className="w-full max-w-md md:max-w-xl"
            >
              <div className="bg-white rounded-2xl shadow-2xl max-h-[78dvh] md:max-h-[88dvh] flex flex-col">
                <div className="p-4 border-b border-gray-100">
                  <h2 className="text-xl font-black text-gray-900 text-center">
                    {quickStart ? '⚡ Partie rapide' : 'Créer une partie'}
                  </h2>
                  {quickStart && (
                    <p className="text-gray-500 text-xs text-center mt-1">
                      🎲 Mix de tous les thèmes — ton prénom, et c'est parti
                    </p>
                  )}
                </div>

                <div className="p-4 space-y-3 overflow-y-auto flex-1 scroll-fade-y">
                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-1 uppercase tracking-wide">
                      Ton prénom
                    </label>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Ex: Marie"
                      className="input-kahoot"
                      maxLength={20}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                  </div>

                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-1 uppercase tracking-wide">
                      Tu es...
                    </label>
                    <div className="flex gap-2">
                      <motion.button
                        type="button"
                        onClick={() => setGender('F')}
                        className={`flex-1 py-2 rounded-xl font-bold text-base transition-all ${
                          gender === 'F'
                            ? 'bg-pink-500 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-600 hover:bg-pink-100'
                        }`}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="text-xl mr-1">👩</span>
                        Femme
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => setGender('M')}
                        className={`flex-1 py-2 rounded-xl font-bold text-base transition-all ${
                          gender === 'M'
                            ? 'bg-blue-500 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-600 hover:bg-blue-100'
                        }`}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="text-xl mr-1">👨</span>
                        Homme
                      </motion.button>
                    </div>
                  </div>

                  {!quickStart && <GameModeSelector value={gameMode} onChange={setGameMode} disabled={loading} />}

                  {!quickStart && <>
                  <CurseurQuestions value={questionCount} onChange={setQuestionCount} />

                  {/* U9 — douze pastilles grises et rien pour dire si "rien de
                      coche" valait "tout" ou "rien". Etat par defaut : TOUT
                      coche, et le compte est affiche en clair. */}
                  <details className="group" open>
                    <summary className="text-gray-600 font-bold text-sm uppercase tracking-wide cursor-pointer list-none flex items-center justify-between">
                      <span>
                        Catégories{' '}
                        <span className={selectedCategories.length === 0 ? 'text-[#e21b3c]' : 'text-[#a3235e]'}>
                          ({selectedCategories.length === TOUTES_CATEGORIES.length
                            ? 'toutes'
                            : `${selectedCategories.length}/${TOUTES_CATEGORIES.length}`})
                        </span>
                      </span>
                      <span className="text-lg group-open:rotate-180 transition-transform">▼</span>
                    </summary>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCategories(TOUTES_CATEGORIES)}
                        className="px-3 py-1 rounded-full text-xs font-bold min-h-0 min-w-0
                                   bg-[#a3235e]/10 text-[#a3235e] hover:bg-[#a3235e]/20 transition-colors"
                      >
                        Tout
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCategories([])}
                        className="px-3 py-1 rounded-full text-xs font-bold min-h-0 min-w-0
                                   bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        Rien
                      </button>
                      <span className="text-[11px] text-gray-400 leading-tight">
                        {selectedCategories.length === 0
                          ? 'Aucune catégorie : impossible de lancer'
                          : 'Les questions seront tirées dans ces thèmes'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {CATEGORY_CONFIG.map((cat) => {
                        const isSelected = selectedCategories.includes(cat.id);
                        return (
                          <motion.button
                            key={cat.id}
                            type="button"
                            role="checkbox"
                            aria-checked={isSelected}
                            onClick={() => toggleCategory(cat.id)}
                            className={`px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1 min-h-0 min-w-0 border ${
                              isSelected
                                ? 'bg-[#864cbf] text-white border-[#864cbf]'
                                : 'bg-white text-gray-500 border-gray-300'
                            }`}
                            whileTap={{ scale: 0.95 }}
                          >
                            <span aria-hidden="true">{isSelected ? '✓' : '+'}</span>
                            <span>{cat.emoji}</span>
                            <span>{cat.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </details>

                  <details className="group">
                    <summary className="text-gray-600 font-bold text-sm uppercase tracking-wide cursor-pointer list-none flex items-center justify-between">
                      <span>Types {selectedTypes.length > 0 ? `(${selectedTypes.length})` : '(tous)'}</span>
                      <span className="text-lg group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Rien de coché ici = tous les types de questions.
                    </p>
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      {TYPE_CONFIG.map((type) => {
                        const isSelected = selectedTypes.includes(type.id);
                        return (
                          <motion.button
                            key={type.id}
                            type="button"
                            onClick={() => toggleType(type.id)}
                            className={`p-1.5 rounded-lg text-center transition-all ${
                              isSelected
                                ? 'bg-[#864cbf] text-white'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                            whileTap={{ scale: 0.95 }}
                          >
                            <span className="text-base block">{type.emoji}</span>
                            <span className="text-[9px] font-bold block">{type.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </details>
                  </>}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                  <motion.button
                    onClick={handleCreate}
                    disabled={!!raisonCreationBloquee() || loading}
                    aria-describedby="aide-creation"
                    className="btn-create w-full disabled:opacity-50 disabled:cursor-not-allowed text-lg py-4"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-3">
                        <div className="spinner w-5 h-5 border-white/30 border-t-white" />
                        Création…
                      </span>
                    ) : (
                      "🚀 C'est parti !"
                    )}
                  </motion.button>
                  {/* U7 : hauteur reservee meme quand il n'y a rien a dire,
                      sinon le bouton remonte des que le prenom est saisi. */}
                  <p id="aide-creation" className="field-hint min-h-[1.2em]">
                    {raisonCreationBloquee() ?? ''}
                  </p>
                </div>
              </div>

              <motion.button
                onClick={() => switchMode('home')}
                className="w-full text-white/70 hover:text-white font-bold py-4 mt-4 transition-colors"
                whileHover={{ scale: 1.02 }}
              >
                ← Retour
              </motion.button>
            </motion.div>
          )}

          {mode === 'join' && (
            <motion.div
              key="join"
              initial={ENTREE_DEPUIS}
              animate={{ opacity: 1, y: 0 }}
              exit={{ ...SORTIE_VERS, transition: SORTIE_ECRAN }}
              transition={ENTREE_ECRAN}
              className="w-full max-w-md md:max-w-lg"
            >
              <div className="bg-white rounded-2xl p-6 md:p-8 shadow-2xl">
                <h2 className="text-xl font-black text-gray-900 text-center mb-4">
                  Rejoindre une partie
                </h2>

                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-2 uppercase tracking-wide">
                      Ton prénom
                    </label>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Ex: Marie"
                      className="input-kahoot"
                      maxLength={20}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-2 uppercase tracking-wide">
                      Tu es...
                    </label>
                    <div className="flex gap-3">
                      <motion.button
                        type="button"
                        onClick={() => setGender('F')}
                        className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${
                          gender === 'F'
                            ? 'bg-pink-500 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-600 hover:bg-pink-100'
                        }`}
                        whileHover={{ scale: gender === 'F' ? 1.05 : 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="text-2xl mr-2">👩</span>
                        Femme
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => setGender('M')}
                        className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${
                          gender === 'M'
                            ? 'bg-blue-500 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-600 hover:bg-blue-100'
                        }`}
                        whileHover={{ scale: gender === 'M' ? 1.05 : 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="text-2xl mr-2">👨</span>
                        Homme
                      </motion.button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-2 uppercase tracking-wide">
                      Code du salon (6 chiffres)
                    </label>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => {
                        setRoomCode(e.target.value.replace(/\D/g, ''));
                        setJoinError(null);
                      }}
                      placeholder="123456"
                      className="input-kahoot text-center text-4xl tracking-[0.5em] font-black"
                      maxLength={6}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    />
                  </div>

                  <motion.button
                    onClick={handleJoin}
                    disabled={!!raisonRejoindreBloquee() || loading}
                    aria-describedby="aide-rejoindre"
                    className="btn-join w-full disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-3">
                        <div className="spinner w-5 h-5 border-white/30 border-t-white" />
                        Connexion…
                      </span>
                    ) : (
                      'Rejoindre'
                    )}
                  </motion.button>
                  {/* U7 : dire ce qui manque plutot que griser en silence. */}
                  <p id="aide-rejoindre" className="field-hint min-h-[1.2em]">
                    {raisonRejoindreBloquee() ?? ''}
                  </p>
                </div>
              </div>

              <motion.button
                onClick={() => switchMode('home')}
                className="w-full text-white/70 hover:text-white font-bold py-4 mt-4 transition-colors"
                whileHover={{ scale: 1.02 }}
              >
                ← Retour
              </motion.button>
            </motion.div>
          )}

          {mode === 'thematic' && (
            <motion.div
              key="thematic"
              initial={ENTREE_DEPUIS}
              animate={{ opacity: 1, y: 0 }}
              exit={{ ...SORTIE_VERS, transition: SORTIE_ECRAN }}
              transition={ENTREE_ECRAN}
              className="w-full max-w-md md:max-w-xl"
            >
              <div className="bg-white rounded-2xl shadow-2xl max-h-[82dvh] md:max-h-[88dvh] flex flex-col">
                <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-pink-500 to-rose-600 rounded-t-2xl relative">
                  <motion.button
                    onClick={() => { setSelectedTheme(null); switchMode('home'); }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white font-bold text-2xl"
                    whileTap={{ scale: 0.9 }}
                  >
                    ←
                  </motion.button>
                  <h2 className="text-xl font-black text-white text-center flex items-center justify-center gap-2">
                    <span>🔞</span> Partie Thématique
                  </h2>
                  <p className="text-white/80 text-sm text-center mt-1">Choisis ton thème osé</p>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto flex-1 scroll-fade-y">
                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-1 uppercase tracking-wide">
                      Ton prénom
                    </label>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Ex: Marie"
                      className="input-kahoot"
                      maxLength={20}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-1 uppercase tracking-wide">
                      Tu es...
                    </label>
                    <div className="flex gap-2">
                      <motion.button
                        type="button"
                        onClick={() => setGender('F')}
                        className={`flex-1 py-2 rounded-xl font-bold text-base transition-all ${
                          gender === 'F'
                            ? 'bg-pink-500 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-600 hover:bg-pink-100'
                        }`}
                        whileTap={{ scale: 0.98 }}
                      >
                        👩 Femme
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={() => setGender('M')}
                        className={`flex-1 py-2 rounded-xl font-bold text-base transition-all ${
                          gender === 'M'
                            ? 'bg-blue-500 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-600 hover:bg-blue-100'
                        }`}
                        whileTap={{ scale: 0.98 }}
                      >
                        👨 Homme
                      </motion.button>
                    </div>
                  </div>

                  <GameModeSelector value={gameMode} onChange={setGameMode} disabled={loading} />

                  <CurseurQuestions value={questionCount} onChange={setQuestionCount} />

                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-2 uppercase tracking-wide">
                      Choisis un thème 🔥
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {THEMATIC_THEMES.map((theme) => {
                        const isSelected = selectedTheme === theme.id;
                        return (
                          <motion.button
                            key={theme.id}
                            type="button"
                            onClick={() => setSelectedTheme(theme.id)}
                            className={`p-3 rounded-xl text-left transition-all border-2 ${
                              isSelected
                                ? `bg-gradient-to-r ${theme.color} text-white border-transparent shadow-lg`
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-pink-300'
                            }`}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{theme.emoji}</span>
                              <span className="font-bold text-sm">{theme.label}</span>
                            </div>
                            <p className={`text-xs mt-1 ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                              {theme.description}
                            </p>
                          </motion.button>
                        );
                      })}
                    </div>
                    {selectedTheme === 'mix_hot' && (
                      <CurseurTorride value={niveauTorride} onChange={setNiveauTorride} />
                    )}
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                  <motion.button
                    onClick={handleCreateThematic}
                    disabled={!!raisonThematiqueBloquee() || loading}
                    aria-describedby="aide-thematique"
                    className="w-full py-4 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-pink-500 to-rose-600 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-3">
                        <div className="spinner w-5 h-5 border-white/30 border-t-white" />
                        Création...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        🔥 Lancer la partie
                      </span>
                    )}
                  </motion.button>
                  {/* U7 : dire ce qui manque plutot que griser en silence. */}
                  <p id="aide-thematique" className="field-hint min-h-[1.2em]">
                    {raisonThematiqueBloquee() ?? ''}
                  </p>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="text-center py-2 text-white/60 text-xs">
        Made with 💕
      </div>
    </div>
  );
}

/**
 * U8 — LE CURSEUR "QUESTIONS: 10".
 *
 * Deux defauts corriges :
 *  - il n'affichait ni minimum ni maximum : impossible de savoir si 10 etait
 *    beaucoup ou trois fois rien. Les bornes sont maintenant ecrites dessous.
 *  - sa piste allait du rouge (a gauche) au vert (a droite) : une partie
 *    courte passait pour un mauvais choix. La couleur ne juge plus, elle
 *    situe : la portion parcourue prend le rose de marque, le reste est gris.
 */
const QUESTIONS_MIN = 5;
const QUESTIONS_MAX = 50;

/**
 * Curseur d'intensite du Mix Torride, de 1 a 10.
 *
 * Il annonce ce qu'il fait avant qu'on y touche : le cran porte un titre
 * ("Tout en douceur", "Sans limites") et la liste des themes ouverts est
 * ecrite dessous. Personne ne decouvre en pleine partie ce que le curseur a
 * decide a sa place.
 */
function CurseurTorride({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const pourcentage = ((value - TORRIDE_MIN) / (TORRIDE_MAX - TORRIDE_MIN)) * 100;
  const palier = PALIERS_TORRIDES[value - 1];
  const ouverts = themesTorrides(value)
    .map((id) => THEMATIC_THEMES.find((t) => t.id === id)?.label ?? id);

  return (
    <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-200">
      <div className="flex items-baseline justify-between mb-1">
        <label htmlFor="curseur-torride" className="text-gray-600 font-bold text-sm uppercase tracking-wide">
          Intensité 🔥
        </label>
        <span className="text-[#c2410c] font-black text-base tabular-nums">
          {value}/{TORRIDE_MAX} — {palier.titre}
        </span>
      </div>
      <input
        id="curseur-torride"
        type="range"
        min={TORRIDE_MIN}
        max={TORRIDE_MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        aria-valuetext={`niveau ${value} sur ${TORRIDE_MAX}, ${palier.titre}`}
        className="curseur-chaleur w-full h-2 rounded-full cursor-pointer"
        style={{ ['--range-fill' as string]: `${pourcentage}%` }}
      />
      <p className="text-[11px] font-semibold text-gray-500 mt-1 leading-snug">
        {ouverts.join(' · ')}
      </p>
    </div>
  );
}

function CurseurQuestions({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const pourcentage = ((value - QUESTIONS_MIN) / (QUESTIONS_MAX - QUESTIONS_MIN)) * 100;
  const libelle = value === QUESTIONS_MAX ? 'Sans limite' : `${value}`;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label htmlFor="curseur-questions" className="text-gray-600 font-bold text-sm uppercase tracking-wide">
          Nombre de questions
        </label>
        <span className="text-[#a3235e] font-black text-base tabular-nums">{libelle}</span>
      </div>
      <input
        id="curseur-questions"
        type="range"
        min={QUESTIONS_MIN}
        max={QUESTIONS_MAX}
        step={5}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        aria-valuetext={value === QUESTIONS_MAX ? 'sans limite' : `${value} questions`}
        className="w-full h-2 rounded-full cursor-pointer"
        style={{ ['--range-fill' as string]: `${pourcentage}%` }}
      />
      <div className="flex justify-between text-[11px] font-bold text-gray-400 mt-1">
        <span>5</span>
        <span>50 = sans limite</span>
      </div>
    </div>
  );
}
