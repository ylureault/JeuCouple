import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import MuteButton from '../components/MuteButton';
import HeartIcon from '../components/HeartIcon';

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
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <MuteButton />

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.5 }}
        className="text-center mb-8"
      >
        <HeartIcon className="w-20 h-20 mx-auto mb-4 text-primary" />
        <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-2">
          Jeu Couples
        </h1>
        <p className="text-white/70">
          Testez votre complicite !
        </p>
      </motion.div>

      {!connected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-500/20 border border-red-500/50 rounded-xl px-4 py-2 mb-4"
        >
          <p className="text-red-300 text-sm">Connexion au serveur...</p>
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-500/20 border border-red-500/50 rounded-xl px-4 py-2 mb-4"
        >
          <p className="text-red-300 text-sm">{error}</p>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {mode === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm space-y-4"
          >
            <button
              onClick={() => switchMode('create')}
              disabled={!connected}
              className="btn-primary w-full text-lg disabled:opacity-50"
            >
              Creer une partie
            </button>
            <button
              onClick={() => switchMode('join')}
              disabled={!connected}
              className="btn-secondary w-full text-lg disabled:opacity-50"
            >
              Rejoindre avec un code
            </button>
          </motion.div>
        )}

        {mode === 'create' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm space-y-4 card"
          >
            <h2 className="text-xl font-bold text-center">Creer une partie</h2>
            <div>
              <label className="block text-white/70 text-sm mb-2">
                Ton prenom
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Ex: Marie"
                className="input-field"
                maxLength={20}
                autoFocus
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={!playerName.trim() || loading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? 'Creation...' : 'Commencer'}
            </button>
            <button
              onClick={() => switchMode('home')}
              className="w-full text-white/50 hover:text-white transition-colors py-2"
            >
              Retour
            </button>
          </motion.div>
        )}

        {mode === 'join' && (
          <motion.div
            key="join"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-sm space-y-4 card"
          >
            <h2 className="text-xl font-bold text-center">Rejoindre une partie</h2>
            <div>
              <label className="block text-white/70 text-sm mb-2">
                Ton prenom
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Ex: Pierre"
                className="input-field"
                maxLength={20}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">
                Code du salon
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                className="input-field text-center text-2xl tracking-widest font-mono"
                maxLength={6}
              />
            </div>
            <button
              onClick={handleJoin}
              disabled={!playerName.trim() || roomCode.length !== 6 || loading}
              className="btn-secondary w-full disabled:opacity-50"
            >
              {loading ? 'Connexion...' : 'Rejoindre'}
            </button>
            <button
              onClick={() => switchMode('home')}
              className="w-full text-white/50 hover:text-white transition-colors py-2"
            >
              Retour
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
