import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';
import MuteButton from '../components/MuteButton';
import ReactionBar from '../components/ReactionBar';
import ReactionOverlay from '../components/ReactionOverlay';
import VoiceChat from '../components/VoiceChat';
import type { Gender } from '../../../shared/types';

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
  const [copied, setCopied] = useState(false);

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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareLink = () => {
    if (room?.code) {
      const url = `${window.location.origin}/join/${room.code}`;

      // Try native share API first (mobile)
      if (navigator.share) {
        navigator.share({
          title: 'Jeu Couples',
          text: `Rejoins-moi pour jouer ! 💕`,
          url: url
        }).catch(() => {
          // Fallback to clipboard
          navigator.clipboard.writeText(url);
        });
      } else {
        // Desktop fallback - copy link
        navigator.clipboard.writeText(url);
      }
      playSound('click');
    }
  };

  const { theme } = useTheme();

  if (!room) return null;

  const isHost = playerId === 1;
  const bothPlayersReady = room.player1_name && room.player2_name;

  return (
    <div className={`h-screen bg-gradient-to-br ${theme.colors.background} flex flex-col overflow-hidden pb-16`}>
      <MuteButton />
      <ReactionOverlay />

      {/* Voice chat - top right */}
      {bothPlayersReady && (
        <div className="fixed top-4 right-16 z-50">
          <VoiceChat />
        </div>
      )}

      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute inset-0"
          animate={{
            background: [
              'radial-gradient(circle at 20% 50%, rgba(123, 44, 191, 0.3) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 50%, rgba(123, 44, 191, 0.3) 0%, transparent 50%)',
              'radial-gradient(circle at 20% 50%, rgba(123, 44, 191, 0.3) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-4"
        >
          <p className="text-white/60 font-semibold uppercase tracking-wider mb-2">
            Code du salon
          </p>
          <motion.div
            onClick={copyCode}
            className="cursor-pointer group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="bg-white rounded-xl px-8 py-4 shadow-2xl relative overflow-hidden">
              <motion.div
                className="absolute inset-0 bg-[#26890c]"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: copied ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                style={{ transformOrigin: 'left' }}
              />
              <p className="text-4xl md:text-5xl font-black tracking-[0.2em] text-[#46178f] relative z-10">
                {copied ? '✓' : room.code}
              </p>
            </div>
            <p className="text-white/50 text-sm mt-3 group-hover:text-white/70 transition-colors">
              {copied ? 'Code copié !' : 'Clique pour copier'}
            </p>
          </motion.div>

          {/* Share link button */}
          <motion.button
            onClick={shareLink}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="mt-3 flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold px-5 py-2 rounded-full transition-colors"
          >
            <span>🔗</span>
            Partager le lien
          </motion.button>
        </motion.div>

        {/* Music indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1 mb-4 bg-white/10 px-3 py-1.5 rounded-full"
        >
          <div className="flex items-end gap-0.5 h-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="music-bar" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <span className="text-white/70 text-sm ml-2">Musique d'ambiance</span>
        </motion.div>

        {/* Players */}
        <div className="w-full max-w-lg space-y-3 mb-4">
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <PlayerCard
              name={room.player1_name}
              gender={room.player1_gender}
              isYou={playerId === 1}
              isReady={!!room.player1_name}
              position={1}
            />
          </motion.div>

          {/* VS separator */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="flex items-center justify-center"
          >
            <div className="w-16 h-16 rounded-full bg-[#e21b3c] flex items-center justify-center shadow-lg">
              <span className="text-2xl font-black text-white">VS</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <PlayerCard
              name={room.player2_name}
              gender={room.player2_gender}
              isYou={playerId === 2}
              isReady={!!room.player2_name}
              position={2}
            />
          </motion.div>
        </div>

        {/* Status / Actions */}
        <AnimatePresence mode="wait">
          {!bothPlayersReady && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center"
            >
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="spinner w-6 h-6" />
                <span className="text-white font-semibold text-lg">
                  En attente de ton partenaire
                  <span className="waiting-dot">.</span>
                  <span className="waiting-dot">.</span>
                  <span className="waiting-dot">.</span>
                </span>
              </div>
              <p className="text-white/60">
                Partage le code <span className="font-mono font-bold text-white">{room.code}</span>
              </p>
            </motion.div>
          )}

          {isHost && bothPlayersReady && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md"
            >
              <motion.button
                onClick={handleStart}
                className="btn-start w-full"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                animate={{
                  boxShadow: [
                    '0 4px 0 0 rgba(0,0,0,0.3)',
                    '0 4px 30px 10px rgba(38, 137, 12, 0.4)',
                    '0 4px 0 0 rgba(0,0,0,0.3)',
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-3xl">🚀</span>
                  Lancer la partie !
                </span>
              </motion.button>
            </motion.div>
          )}

          {!isHost && bothPlayersReady && (
            <motion.div
              key="waiting-host"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 bg-white/10 rounded-xl px-6 py-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="text-2xl"
              >
                ⏳
              </motion.div>
              <span className="text-white font-semibold">
                {room.player1_name} va lancer la partie...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#e21b3c] rounded-xl px-6 py-3 mt-4"
          >
            <p className="text-white font-bold">{error}</p>
          </motion.div>
        )}

        {/* Leave button */}
        <motion.button
          onClick={handleLeave}
          className="mt-4 text-white/50 hover:text-white font-semibold text-sm transition-colors"
          whileHover={{ scale: 1.05 }}
        >
          ← Quitter le salon
        </motion.button>
      </div>

      {/* Fixed Reaction Bar at bottom */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-0 left-0 right-0 bg-black/30 backdrop-blur-sm py-3 px-4 border-t border-white/10 z-40"
      >
        <ReactionBar />
      </motion.div>
    </div>
  );
}

interface PlayerCardProps {
  name: string | null;
  gender: Gender | null;
  isYou: boolean;
  isReady: boolean;
  position: 1 | 2;
}

function PlayerCard({ name, gender, isYou, isReady, position }: PlayerCardProps) {
  // Gender-based colors
  const getGenderColors = () => {
    if (!isReady || !gender) {
      return {
        bg: 'bg-white/10 border-2 border-dashed border-white/30',
        avatarBg: 'bg-white/10',
        glow: ''
      };
    }
    if (gender === 'F') {
      return {
        bg: 'bg-gradient-to-r from-pink-500 to-pink-600 shadow-lg',
        avatarBg: 'bg-white/20',
        glow: 'shadow-[0_0_20px_rgba(236,72,153,0.5)]'
      };
    }
    return {
      bg: 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg',
      avatarBg: 'bg-white/20',
      glow: 'shadow-[0_0_20px_rgba(59,130,246,0.5)]'
    };
  };

  const colors = getGenderColors();
  const emoji = gender === 'F' ? '👩' : gender === 'M' ? '👨' : '❓';

  return (
    <motion.div
      className={`relative rounded-xl p-4 transition-all duration-300 ${colors.bg} ${colors.glow}`}
      animate={isReady ? {} : { borderColor: ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.3)'] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <motion.div
          className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${colors.avatarBg}`}
          animate={isReady ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.5 }}
        >
          {isReady ? emoji : '❓'}
        </motion.div>

        {/* Info */}
        <div className="flex-1">
          <p className="text-white/60 text-sm font-semibold uppercase tracking-wide">
            Joueur {position}
          </p>
          <p className="text-white text-xl font-bold">
            {name || 'En attente...'}
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          {isYou && (
            <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-bold">
              Toi
            </span>
          )}
          {isReady && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center"
            >
              <span className={gender === 'F' ? 'text-pink-500 text-xl' : 'text-blue-500 text-xl'}>✓</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Waiting animation */}
      {!isReady && (
        <motion.div
          className="absolute bottom-2 right-4 flex gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-white/50 rounded-full"
              animate={{ y: [0, -8, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
