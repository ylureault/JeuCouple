import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import MuteButton from '../components/MuteButton';

type Mode = 'home' | 'create' | 'join';

export default function Home() {
  const [mode, setMode] = useState<Mode>('home');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { createRoom, joinRoom, error, connected } = useGame();
  const { playSound } = useAudio();
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!playerName.trim()) return;
    setLoading(true);
    playSound('click');
    try {
      await createRoom(playerName.trim());
      navigate('/game');
    } catch {
      // Error handled in context
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !roomCode.trim()) return;
    setLoading(true);
    playSound('click');
    try {
      await joinRoom(roomCode.trim().toUpperCase(), playerName.trim());
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

  return (
    <div className="min-h-screen bg-kahoot-lobby flex flex-col">
      <MuteButton />

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
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        {/* Logo and title */}
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="text-center mb-12"
        >
          <motion.div
            className="text-8xl mb-4"
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
          <h1 className="text-5xl md:text-7xl font-black text-white text-shadow-strong mb-3">
            Jeu Couples
          </h1>
          <p className="text-xl text-white/80 font-semibold">
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
              className="w-full max-w-md space-y-4"
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
                  Creer une partie
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
              <div className="bg-white rounded-2xl p-8 shadow-2xl">
                <h2 className="text-2xl font-black text-gray-900 text-center mb-6">
                  Creer une partie
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-2 uppercase tracking-wide">
                      Ton prenom
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

                  <motion.button
                    onClick={handleCreate}
                    disabled={!playerName.trim() || loading}
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
              <div className="bg-white rounded-2xl p-8 shadow-2xl">
                <h2 className="text-2xl font-black text-gray-900 text-center mb-6">
                  Rejoindre une partie
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-600 font-bold text-sm mb-2 uppercase tracking-wide">
                      Ton prenom
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
                    disabled={!playerName.trim() || roomCode.length !== 6 || loading}
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
      <div className="text-center py-4 text-white/40 text-sm">
        Made with 💕
      </div>
    </div>
  );
}
