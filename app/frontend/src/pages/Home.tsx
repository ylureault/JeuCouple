import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';
import MuteButton from '../components/MuteButton';
import ThemeSelector from '../components/ThemeSelector';
import type { Gender } from '../../../shared/types';

type Mode = 'home' | 'create' | 'join';

export default function Home() {
  const [mode, setMode] = useState<Mode>('home');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [gender, setGender] = useState<Gender | null>(null);
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
    if (!playerName.trim() || !gender) return;
    setLoading(true);
    playSound('click');
    try {
      await createRoom(playerName.trim(), gender, questionCount);
      navigate('/game');
    } catch {
      // Error handled in context
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !roomCode.trim() || !gender) return;
    setLoading(true);
    playSound('click');
    try {
      await joinRoom(roomCode.trim().toUpperCase(), playerName.trim(), gender);
      navigate('/game');
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
    <div className={`h-screen bg-gradient-to-br ${theme.colors.background} flex flex-col overflow-hidden`}>
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

        {/* Connection status */}
        {!connected && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-black/30 backdrop-blur rounded-xl px-6 py-3 mb-6 flex items-center gap-3"
          >
            <div className="spinner w-5 h-5" />
            <p className="text-white font-semibold">Connexion au serveur...</p>
          </motion.div>
        )}

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
                onClick={() => switchMode('create')}
                disabled={!connected}
                className="btn-create w-full disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-2xl">🎮</span>
                  Créer une partie
                </span>
              </motion.button>

              <motion.button
                onClick={() => switchMode('join')}
                disabled={!connected}
                className="btn-join w-full disabled:opacity-50 disabled:cursor-not-allowed"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
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
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20 }}
              className="w-full max-w-md"
            >
              <div className="bg-white rounded-2xl p-6 shadow-2xl">
                <h2 className="text-xl font-black text-gray-900 text-center mb-4">
                  Créer une partie
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
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
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
                      Nombre de questions
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="5"
                        max="50"
                        step="5"
                        value={questionCount}
                        onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                        className="flex-1 h-3 rounded-full cursor-pointer accent-[#864cbf]"
                      />
                      <span className="text-2xl font-black text-[#864cbf] min-w-[3rem] text-center">
                        {questionCount === 50 ? '∞' : questionCount}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                      <span>5 min</span>
                      <span>25 min</span>
                      <span>∞ (200pts)</span>
                    </div>
                  </div>

                  <motion.button
                    onClick={handleCreate}
                    disabled={!playerName.trim() || !gender || loading}
                    className="btn-create w-full disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-3">
                        <div className="spinner w-5 h-5 border-white/30 border-t-white" />
                        Creation...
                      </span>
                    ) : (
                      "C'est parti !"
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
                      Code du salon
                    </label>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="ABC123"
                      className="input-kahoot text-center text-3xl tracking-[0.3em] font-black"
                      maxLength={6}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    />
                  </div>

                  <motion.button
                    onClick={handleJoin}
                    disabled={!playerName.trim() || !gender || roomCode.length !== 6 || loading}
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
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="text-center py-2 text-white/40 text-xs">
        Made with 💕
      </div>
    </div>
  );
}
