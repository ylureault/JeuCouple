import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import type { ReactionData } from '../../../shared/types';

interface FloatingReaction extends ReactionData {
  id: string;
  x: number;
  size: number;
  rotation: number;
  path: 'left' | 'right' | 'center';
}

// Particle burst effect for reactions
function ParticleBurst({ emoji, x }: { emoji: string; x: number }) {
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
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [bursts, setBursts] = useState<{ id: string; emoji: string; x: number }[]>([]);

  useEffect(() => {
    const lastReaction = reactions[reactions.length - 1];
    if (lastReaction) {
      const id = `${lastReaction.timestamp}-${lastReaction.playerId}-${Math.random()}`;
      const x = 15 + Math.random() * 70;
      const size = 1 + Math.random() * 0.5;
      const rotation = -15 + Math.random() * 30;
      const paths: ('left' | 'right' | 'center')[] = ['left', 'right', 'center'];
      const path = paths[Math.floor(Math.random() * 3)];

      setFloatingReactions((prev) => [
        ...prev,
        { ...lastReaction, id, x, size, rotation, path }
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
  }, [reactions]);

  const getPlayerName = (reactionPlayerId: 1 | 2) => {
    if (!room) return '';
    if (reactionPlayerId === playerId) return 'Toi';
    return reactionPlayerId === 1 ? room.player1_name : room.player2_name;
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
          <ParticleBurst key={burst.id} emoji={burst.emoji} x={burst.x} />
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
              {/* Glow effect */}
              <motion.div
                className="absolute inset-0 rounded-full blur-xl opacity-50"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%)',
                  transform: `scale(${reaction.size * 1.5})`
                }}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1, repeat: Infinity }}
              />

              {/* Main emoji */}
              <motion.span
                animate={{
                  rotate: [reaction.rotation, reaction.rotation + 20, reaction.rotation - 20, reaction.rotation],
                  scale: [1, 1.1, 0.95, 1]
                }}
                transition={{ repeat: Infinity, duration: 0.8 }}
                style={{ fontSize: `${reaction.size * 3.5}rem` }}
                className="relative z-10 drop-shadow-lg"
              >
                {reaction.emoji}
              </motion.span>

              {/* Player name badge */}
              <motion.span
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-white text-xs mt-2 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full font-semibold shadow-lg"
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
