import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import MuteButton from '../components/MuteButton';
import HeartIcon from '../components/HeartIcon';

export default function Lobby() {
  const {
    room,
    playerId,
    startGame,
    leaveRoom,
    phase,
    error
  } = useGame();
  const { playSound, playLobbyMusic, stopLobbyMusic } = useAudio();
  const navigate = useNavigate();

  useEffect(() => {
    playLobbyMusic();
    return () => stopLobbyMusic();
  }, [playLobbyMusic, stopLobbyMusic]);

  useEffect(() => {
    if (phase === 'question') {
      stopLobbyMusic();
      navigate('/game');
    }
  }, [phase, navigate, stopLobbyMusic]);

  useEffect(() => {
    if (!room) {
      navigate('/');
    }
  }, [room, navigate]);

  const handleStart = async () => {
    playSound('click');
    try {
      await startGame();
    } catch {
      // Error handled in context
    }
  };

  const handleLeave = () => {
    playSound('click');
    leaveRoom();
    navigate('/');
  };

  const copyCode = () => {
    if (room?.code) {
      navigator.clipboard.writeText(room.code);
      playSound('click');
    }
  };

  if (!room) return null;

  const isHost = playerId === 1;
  const bothPlayersReady = room.player1_name && room.player2_name;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <MuteButton />

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center w-full max-w-md"
      >
        <HeartIcon className="w-16 h-16 mx-auto mb-4 text-primary" />

        <h2 className="text-xl text-white/70 mb-2">Code du salon</h2>
        <motion.div
          className="card mb-8 cursor-pointer"
          onClick={copyCode}
          whileTap={{ scale: 0.98 }}
        >
          <p className="text-5xl font-mono font-bold tracking-[0.3em] text-primary">
            {room.code}
          </p>
          <p className="text-sm text-white/50 mt-2">
            Appuie pour copier
          </p>
        </motion.div>

        <div className="space-y-4 mb-8">
          <PlayerSlot
            name={room.player1_name}
            label="Joueur 1"
            isYou={playerId === 1}
            isReady={!!room.player1_name}
          />
          <PlayerSlot
            name={room.player2_name}
            label="Joueur 2"
            isYou={playerId === 2}
            isReady={!!room.player2_name}
          />
        </div>

        {!bothPlayersReady && (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-white/70 mb-6"
          >
            <p>En attente de l'autre joueur...</p>
            <p className="text-sm mt-2">
              Partage le code <span className="font-mono font-bold text-primary">{room.code}</span> avec ton partenaire
            </p>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-500/20 border border-red-500/50 rounded-xl px-4 py-2 mb-4"
          >
            <p className="text-red-300 text-sm">{error}</p>
          </motion.div>
        )}

        {isHost && bothPlayersReady && (
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={handleStart}
            className="btn-primary w-full text-xl mb-4"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Lancer la partie
          </motion.button>
        )}

        {!isHost && bothPlayersReady && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-white/70 mb-4"
          >
            <p>En attente du lancement par l'hote...</p>
          </motion.div>
        )}

        <button
          onClick={handleLeave}
          className="text-white/50 hover:text-white transition-colors py-2"
        >
          Quitter le salon
        </button>
      </motion.div>
    </div>
  );
}

interface PlayerSlotProps {
  name: string | null;
  label: string;
  isYou: boolean;
  isReady: boolean;
}

function PlayerSlot({ name, label, isYou, isReady }: PlayerSlotProps) {
  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={`
        card flex items-center gap-4 transition-all
        ${isReady ? 'border-2 border-green-500/50' : 'border-2 border-white/20'}
      `}
    >
      <div
        className={`
          w-12 h-12 rounded-full flex items-center justify-center text-xl
          ${isReady ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/30'}
        `}
      >
        {isReady ? '✓' : '?'}
      </div>
      <div className="flex-1 text-left">
        <p className="text-sm text-white/50">{label}</p>
        <p className={`font-bold ${isReady ? 'text-white' : 'text-white/30'}`}>
          {name || 'En attente...'}
        </p>
      </div>
      {isYou && (
        <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">
          Toi
        </span>
      )}
    </motion.div>
  );
}
