import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';
import MuteButton from '../components/MuteButton';
import ThemeSelector from '../components/ThemeSelector';
import GameModeSelector from '../components/GameModeSelector';
import { consulterSalon, traduireErreur } from '../lib/salon';
import type { Gender, GameMode } from '../../../shared/types';

type Mode = 'home' | 'create' | 'join' | 'thematic';

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
  { id: 'mix_hot', label: 'Mix Torride', emoji: '🔥', description: 'Un mélange de tous les thèmes osés', color: 'from-orange-500 to-red-500' },
] as const;

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
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>('mix_all');
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

  const handleCreate = async () => {
    if (!playerName.trim() || !gender || !connected) return;
    setLoading(true);
    playSound('click');
    try {
      // Pass selected categories and types (empty array = all / auto mode)
      const code = await createRoom(
        playerName.trim(), gender,
        quickStart ? 10 : questionCount,
        quickStart ? [] : selectedCategories,
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
      // For thematic games, use the theme as the only category
      // mix_hot uses all explicit themes together
      // mix_all = aucune restriction (tout le catalogue) ;
      // mix_hot = tous les themes oses de cette liste.
      const themeCategories = selectedTheme === 'mix_all'
        ? []
        : selectedTheme === 'mix_hot'
          ? THEMATIC_THEMES.filter(t => t.id !== 'mix_hot' && t.id !== 'mix_all').map(t => t.id)
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

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
        {/* Logo and title */}
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className={`text-center transition-all ${mode === 'home' ? 'mb-6' : 'mb-3'}`}
        >
          <motion.div
            className={`${mode === 'home' ? 'text-6xl mb-2' : 'text-3xl mb-1'} transition-all`}
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
          {mode === 'home' && (
            <p className="text-lg text-white/80 font-semibold">
              Testez votre complicité !
            </p>
          )}
        </motion.div>

        {/* Connection status indicator */}
        {mode === 'home' && <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-full px-4 py-2 mb-4 flex items-center gap-2 ${
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
          <p className="text-white text-sm font-medium">
            {/* Distinguer "je me connecte" de "j'ai perdu la connexion" : le
                joueur doit savoir si les boutons sont grises pour une seconde
                ou parce que le serveur ne repond plus. */}
            {connected ? 'Connecté' : reconnecting ? 'Connexion perdue : reconnexion...' : 'Connexion...'}
          </p>
        </motion.div>}

        {/* Error message — toujours en francais, jamais le brut du serveur */}
        {messageErreur && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#e21b3c] rounded-xl px-6 py-3 mb-6 shadow-lg max-w-md"
            role="alert"
          >
            <p className="text-white font-bold">{messageErreur}</p>
          </motion.div>
        )}

        {/* Main buttons / forms */}
        <AnimatePresence mode="wait">
          {mode === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20 }}
              className="w-full max-w-md space-y-3"
            >
              {/* B5 : `disabled` et non un simple style. Un bouton qui a l'air
                  cliquable mais ne fait rien est le pire des deux mondes : le
                  joueur clique dix fois sans comprendre. Grise + curseur
                  interdit + inerte pour le clavier et le lecteur d'ecran. */}
              <motion.button
                onClick={() => { if (connected) { setQuickStart(true); switchMode('create'); } }}
                disabled={!connected}
                aria-disabled={!connected}
                className={`btn-start w-full ${!connected ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
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
                className={`btn-create w-full ${!connected ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                whileHover={connected ? { scale: 1.02 } : {}}
                whileTap={connected ? { scale: 0.98 } : {}}
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-2xl">🎮</span>
                  Créer une partie
                  {!connected && <span className="text-sm opacity-70">(connexion...)</span>}
                </span>
              </motion.button>

              <motion.button
                onClick={() => connected && switchMode('thematic')}
                disabled={!connected}
                aria-disabled={!connected}
                className={`w-full py-3 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-pink-500 to-rose-600 shadow-lg ${!connected ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
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
                className={`btn-join w-full ${!connected ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                whileHover={connected ? { scale: 1.02 } : {}}
                whileTap={connected ? { scale: 0.98 } : {}}
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-2xl">🔗</span>
                  Rejoindre avec un code
                  {!connected && <span className="text-sm opacity-70">(connexion...)</span>}
                </span>
              </motion.button>
            </motion.div>
          )}

          {mode === 'create' && (
            <motion.div
              key="create"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20 }}
              className="w-full max-w-md"
            >
              <div className="bg-white rounded-2xl shadow-2xl max-h-[78dvh] flex flex-col">
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
                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-1 uppercase tracking-wide">
                      Questions: {questionCount === 50 ? '∞' : questionCount}
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="5"
                      value={questionCount}
                      onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                      className="w-full h-2 rounded-full cursor-pointer accent-[#864cbf]"
                    />
                  </div>

                  <details className="group">
                    <summary className="text-gray-600 font-bold text-sm uppercase tracking-wide cursor-pointer list-none flex items-center justify-between">
                      <span>Catégories {selectedCategories.length > 0 && `(${selectedCategories.length})`}</span>
                      <span className="text-lg group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {CATEGORY_CONFIG.map((cat) => {
                        const isSelected = selectedCategories.includes(cat.id);
                        return (
                          <motion.button
                            key={cat.id}
                            type="button"
                            onClick={() => toggleCategory(cat.id)}
                            className={`px-2 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1 ${
                              isSelected
                                ? 'bg-[#864cbf] text-white'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                            whileTap={{ scale: 0.95 }}
                          >
                            <span>{cat.emoji}</span>
                            <span>{cat.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </details>

                  <details className="group">
                    <summary className="text-gray-600 font-bold text-sm uppercase tracking-wide cursor-pointer list-none flex items-center justify-between">
                      <span>Types {selectedTypes.length > 0 && `(${selectedTypes.length})`}</span>
                      <span className="text-lg group-open:rotate-180 transition-transform">▼</span>
                    </summary>
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
                    disabled={!playerName.trim() || !gender || loading || !connected}
                    className="btn-create w-full disabled:opacity-50 disabled:cursor-not-allowed text-lg py-4"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-3">
                        <div className="spinner w-5 h-5 border-white/30 border-t-white" />
                        Creation...
                      </span>
                    ) : (
                      "🚀 C'est parti !"
                    )}
                  </motion.button>
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
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20 }}
              className="w-full max-w-md"
            >
              <div className="bg-white rounded-2xl p-6 shadow-2xl">
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
                    disabled={!playerName.trim() || !gender || roomCode.length < 6 || loading}
                    className="btn-join w-full disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-3">
                        <div className="spinner w-5 h-5 border-white/30 border-t-white" />
                        Connexion...
                      </span>
                    ) : (
                      'Rejoindre'
                    )}
                  </motion.button>
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
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20 }}
              className="w-full max-w-md"
            >
              <div className="bg-white rounded-2xl shadow-2xl max-h-[82dvh] flex flex-col">
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

                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-1 uppercase tracking-wide">
                      Questions: {questionCount === 50 ? '∞' : questionCount}
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="5"
                      value={questionCount}
                      onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                      className="w-full h-2 rounded-full cursor-pointer accent-pink-500"
                    />
                  </div>

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
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                  <motion.button
                    onClick={handleCreateThematic}
                    disabled={!playerName.trim() || !gender || !selectedTheme || loading || !connected}
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
