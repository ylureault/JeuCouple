import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import type { ReactionData, Gender } from '../../../shared/types';

interface FloatingReaction extends ReactionData {
  id: string;
  x: number;
  size: number;
  rotation: number;
  path: 'left' | 'right' | 'center';
  gender: Gender | null;
}

// Particle burst effect for reactions
function ParticleBurst({ x }: { x: number }) {
  const particles = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    angle: (i * 60) * (Math.PI / 180),
    distance: 30 + Math.random() * 20
  }));

  return (
    <div className="absolute" style={{ left: `${x}%`, bottom: '80px' }}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0.5 }}
          animate={{
            opacity: 0,
            x: Math.cos(p.angle) * p.distance,
            y: Math.sin(p.angle) * p.distance - 20,
            scale: 0
          }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="absolute text-lg"
        >
          ✨
        </motion.div>
      ))}
    </div>
  );
}

export default function ReactionOverlay() {
  const { reactions, playerId, room } = useGame();
  const { playEmojiSound } = useAudio();
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [bursts, setBursts] = useState<{ id: string; emoji: string; x: number }[]>([]);

  // Get gender for a player
  const getPlayerGender = (reactionPlayerId: 1 | 2): Gender | null => {
    if (!room) return null;
    return reactionPlayerId === 1 ? room.player1_gender : room.player2_gender;
  };

  useEffect(() => {
    const lastReaction = reactions[reactions.length - 1];
    if (lastReaction) {
      const id = `${lastReaction.timestamp}-${lastReaction.playerId}-${Math.random()}`;
      const x = 15 + Math.random() * 70;
      const size = 1 + Math.random() * 0.5;
      const rotation = -15 + Math.random() * 30;
      const paths: ('left' | 'right' | 'center')[] = ['left', 'right', 'center'];
      const path = paths[Math.floor(Math.random() * 3)];
      const gender = getPlayerGender(lastReaction.playerId);

      // Son a la reception d'une reaction du partenaire.
      // Chaque emoji a sa propre signature sonore : le bip unique d'avant ne
      // permettait pas de savoir lequel avait ete envoye sans regarder l'ecran.
      if (lastReaction.playerId !== playerId) {
        playEmojiSound(lastReaction.emoji);
      }

      setFloatingReactions((prev) => [
        ...prev,
        { ...lastReaction, id, x, size, rotation, path, gender }
      ]);

      // Add particle burst
      const burstId = `burst-${id}`;
      setBursts((prev) => [...prev, { id: burstId, emoji: lastReaction.emoji, x }]);
      setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== burstId));
      }, 800);

      // Remove floating reaction after animation
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
      }, 3500);
    }
  }, [reactions, playerId, playEmojiSound]);

  const getPlayerName = (reactionPlayerId: 1 | 2) => {
    if (!room) return '';
    if (reactionPlayerId === playerId) return 'Toi';
    return reactionPlayerId === 1 ? room.player1_name : room.player2_name;
  };

  // Get color based on gender
  const getGenderColor = (gender: Gender | null) => {
    if (gender === 'F') return { glow: 'rgba(236, 72, 153, 0.7)', bg: 'bg-pink-500/70', border: 'border-pink-400' };
    if (gender === 'M') return { glow: 'rgba(59, 130, 246, 0.7)', bg: 'bg-blue-500/70', border: 'border-blue-400' };
    return { glow: 'rgba(255, 255, 255, 0.5)', bg: 'bg-white/50', border: 'border-white' };
  };

  const getPathAnimation = (path: 'left' | 'right' | 'center') => {
    switch (path) {
      case 'left':
        return { x: [-20, -40, -30], y: [0, -150, -300] };
      case 'right':
        return { x: [20, 40, 30], y: [0, -150, -300] };
      default:
        return { x: [0, 10, -10, 0], y: [0, -100, -200, -300] };
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {/* Particle bursts */}
      <AnimatePresence>
        {bursts.map((burst) => (
          <ParticleBurst key={burst.id} x={burst.x} />
        ))}
      </AnimatePresence>

      {/* Floating reactions */}
      <AnimatePresence>
        {floatingReactions.map((reaction) => (
          <motion.div
            key={reaction.id}
            initial={{ opacity: 0, scale: 0, y: 50 }}
            animate={{
              opacity: [0, 1, 1, 0.8, 0],
              scale: [0.5, 1.2, 1, 0.9, 0.5],
              ...getPathAnimation(reaction.path)
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 3, ease: 'easeOut' }}
            style={{ left: `${reaction.x}%` }}
            className="absolute bottom-24 -translate-x-1/2"
          >
            <div className="flex flex-col items-center">
              {/* Glow effect with gender color */}
              <motion.div
                className="absolute inset-0 rounded-full blur-xl opacity-60"
                style={{
                  background: `radial-gradient(circle, ${getGenderColor(reaction.gender).glow} 0%, transparent 70%)`,
                  transform: `scale(${reaction.size * 1.8})`
                }}
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 1, repeat: Infinity }}
              />

              {/* Main emoji with colored ring */}
              <motion.div
                animate={{
                  rotate: [reaction.rotation, reaction.rotation + 20, reaction.rotation - 20, reaction.rotation],
                  scale: [1, 1.1, 0.95, 1]
                }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                style={{ fontSize: `${reaction.size * 3.5}rem` }}
                className={`relative z-10 drop-shadow-lg rounded-full p-1 border-2 ${getGenderColor(reaction.gender).border}`}
              >
                {reaction.emoji}
              </motion.div>

              {/* Player name badge with gender color */}
              <motion.span
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`text-white text-xs mt-2 ${getGenderColor(reaction.gender).bg} backdrop-blur-sm px-3 py-1 rounded-full font-semibold shadow-lg border ${getGenderColor(reaction.gender).border}`}
              >
                {getPlayerName(reaction.playerId)}
              </motion.span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
