import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import type { ReactionData } from '../../../shared/types';

interface FloatingReaction extends ReactionData {
  id: string;
  x: number;
}

export default function ReactionOverlay() {
  const { reactions, playerId, room } = useGame();
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  useEffect(() => {
    // Add new reactions to floating display
    const lastReaction = reactions[reactions.length - 1];
    if (lastReaction) {
      const id = `${lastReaction.timestamp}-${lastReaction.playerId}-${Math.random()}`;
      const x = 10 + Math.random() * 80; // Random position 10-90% from left

      setFloatingReactions((prev) => [
        ...prev,
        { ...lastReaction, id, x }
      ]);

      // Remove after animation
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
      }, 3000);
    }
  }, [reactions]);

  const getPlayerName = (reactionPlayerId: 1 | 2) => {
    if (!room) return '';
    if (reactionPlayerId === playerId) return 'Toi';
    return reactionPlayerId === 1 ? room.player1_name : room.player2_name;
  };

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      <AnimatePresence>
        {floatingReactions.map((reaction) => (
          <motion.div
            key={reaction.id}
            initial={{ opacity: 0, y: 100, scale: 0.5 }}
            animate={{ opacity: 1, y: -200, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 2.5, ease: 'easeOut' }}
            style={{ left: `${reaction.x}%` }}
            className="absolute bottom-20 -translate-x-1/2"
          >
            <div className="flex flex-col items-center">
              <motion.span
                animate={{ rotate: [-10, 10, -10] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className="text-5xl"
              >
                {reaction.emoji}
              </motion.span>
              <span className="text-white/80 text-xs mt-1 bg-black/30 px-2 py-0.5 rounded-full">
                {getPlayerName(reaction.playerId)}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
