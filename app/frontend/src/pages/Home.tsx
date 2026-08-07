import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';
import MuteButton from '../components/MuteButton';
import ThemeSelector from '../components/ThemeSelector';
import GameModeSelector from '../components/GameModeSelector';
import type { Gender, GameMode } from '../../../shared/types';

type Mode = 'home' | 'create' | 'join' | 'thematic';

// Thematic game configuration - explicit themes
const THEMATIC_THEMES = [
  { id: 'fantasmes', label: 'Fantasmes', emoji: '💭', description: 'Vos désirs secrets et inavoués', color: 'from-violet-500 to-purple-600' },
  { id: 'preliminaires', label: 'Préliminaires', emoji: '💋', description: "L'art de faire monter le désir", color: 'from-red-400 to-pink-600' },
  { id: 'kamasutra', label: 'Kamasutra', emoji: '🧘', description: 'Positions et techniques', color: 'from-amber-500 to-orange-600' },
  { id: 'fellation', label: 'Fellation', emoji: '👄', description: 'Plaisirs oraux masculins', color: 'from-pink-500 to-rose-600' },
  { id: 'cunnilingus', label: 'Cunnilingus', emoji: '👅', description: 'Plaisirs oraux féminins', color: 'from-pink-400 to-fuchsia-600' },
  { id: '69', label: 'Position 69', emoji: '🔄', description: 'Plaisir mutuel simultané', color: 'from-purple-500 to-indigo-600' },
  { id: 'sodomie', label: 'Sodomie', emoji: '🍑', description: 'Le plaisir anal', color: 'from-orange-500 to-red-600' },
  { id: 'jeux_role', label: 'Jeux de rôle', emoji: '🎭', description: 'Scénarios et personnages coquins', color: 'from-emerald-500 to-teal-600' },
  { id: 'bdsm', label: 'BDSM', emoji: '⛓️', description: 'Domination, soumission et plus', color: 'from-gray-700 to-gray-900' },
  { id: 'sextoys', label: 'Sextoys', emoji: '🎀', description: 'Jouets et accessoires coquins', color: 'from-fuchsia-500 to-pink-600' },
  { id: 'confessions', label: 'Confessions', emoji: '🤫', description: 'Aveux intimes et secrets', color: 'from-rose-400 to-red-500' },
  { id: 'public', label: 'Sexe en public', emoji: '🏖️', description: 'Oser en dehors de la chambre', color: 'from-sky-500 to-blue-600' },
  { id: 'seduction', label: 'Séduction', emoji: '😏', description: 'Drague et attirance', color: 'from-rose-500 to-pink-500' },
  { id: 'massage', label: 'Massage', emoji: '💆', description: 'Toucher sensuel et détente', color: 'from-teal-400 to-cyan-600' },
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
  { id: 'culture', label: 'Culture G', emoji: '🧠' },
  { id: 'comportement', label: 'Comportement', emoji: '🎭' },
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
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('classic');
  const { createRoom, joinRoom, error, connected } = useGame();
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
      const code = await createRoom(playerName.trim(), gender, questionCount, selectedCategories, selectedTypes, gameMode);
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
      const themeCategories = selectedTheme === 'mix_hot'
        ? THEMATIC_THEMES.filter(t => t.id !== 'mix_hot').map(t => t.id)
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
    if (!playerName.trim() || !roomCode.trim() || !gender) return;
    setLoading(true);
    playSound('click');
    try {
      const code = await joinRoom(roomCode.trim().toUpperCase(), playerName.trim(), gender);
      navigate(`/salon/${code}`);
    } catch {
      // Error handled in context
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    playSound('click');
    setMode(newMode);
  };

  const { theme } = useTheme();

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
          className="text-center mb-6"
        >
          <motion.div
            className="text-6xl mb-2"
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
          <h1 className="text-4xl md:text-5xl font-black text-white text-shadow-strong mb-1">
            Jeu Couples
          </h1>
          <p className="text-lg text-white/80 font-semibold">
            Testez votre complicite !
          </p>
        </motion.div>

        {/* Connection status indicator */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-full px-4 py-2 mb-4 flex items-center gap-2 ${
            connected
              ? 'bg-green-500/20 border border-green-400/50'
              : 'bg-yellow-500/20 border border-yellow-400/50'
          }`}
        >
          <div className={`w-3 h-3 rounded-full ${
            connected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-pulse'
          }`} />
          <p className="text-white text-sm font-medium">
            {connected ? 'Connecté' : 'Connexion...'}
          </p>
        </motion.div>

        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#e21b3c] rounded-xl px-6 py-3 mb-6 shadow-lg"
          >
            <p className="text-white font-bold">{error}</p>
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
              <motion.button
                onClick={() => connected && switchMode('create')}
                className={`btn-create w-full ${!connected ? 'opacity-70 cursor-wait' : ''}`}
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
                className={`w-full py-3 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-pink-500 to-rose-600 shadow-lg ${!connected ? 'opacity-70 cursor-wait' : ''}`}
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
                className={`btn-join w-full ${!connected ? 'opacity-70 cursor-wait' : ''}`}
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
              <div className="bg-white rounded-2xl shadow-2xl max-h-[70dvh] flex flex-col">
                <div className="p-4 border-b border-gray-100">
                  <h2 className="text-xl font-black text-gray-900 text-center">
                    Créer une partie
                  </h2>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto flex-1">
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
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                  <motion.button
                    onClick={handleCreate}
                    disabled={!playerName.trim() || !gender || loading}
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
                      placeholder="Ex: Pierre"
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
                      Code du salon (4 chiffres)
                    </label>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="1234"
                      className="input-kahoot text-center text-4xl tracking-[0.5em] font-black"
                      maxLength={4}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    />
                  </div>

                  <motion.button
                    onClick={handleJoin}
                    disabled={!playerName.trim() || !gender || roomCode.length !== 4 || loading}
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
              <div className="bg-white rounded-2xl shadow-2xl max-h-[80dvh] flex flex-col">
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

                <div className="p-4 space-y-3 overflow-y-auto flex-1">
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
                    disabled={!playerName.trim() || !gender || !selectedTheme || loading}
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
      <div className="text-center py-2 text-white/40 text-xs">
        Made with 💕
      </div>
    </div>
  );
}
