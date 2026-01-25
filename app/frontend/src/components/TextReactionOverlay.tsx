import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import type { TextReactionData, Gender } from '../../../shared/types';

interface FloatingTextReaction extends TextReactionData {
  id: string;
  gender: Gender | null;
  isFromMe?: boolean;
}

export default function TextReactionOverlay() {
  const { textReactions, playerId, room } = useGame();
  const { playSound } = useAudio();
  const [floatingReactions, setFloatingReactions] = useState<FloatingTextReaction[]>([]);

  // Get gender for a player
  const getPlayerGender = (reactionPlayerId: 1 | 2): Gender | null => {
    if (!room) return null;
    return reactionPlayerId === 1 ? room.player1_gender : room.player2_gender;
  };

  const getPlayerName = (reactionPlayerId: 1 | 2) => {
    if (!room) return '';
    if (reactionPlayerId === playerId) return 'Toi';
    return reactionPlayerId === 1 ? room.player1_name : room.player2_name;
  };

  // Get color based on gender
  const getGenderStyle = (gender: Gender | null) => {
    if (gender === 'F') return { bg: 'bg-pink-500', border: 'border-pink-400', text: 'text-pink-100' };
    if (gender === 'M') return { bg: 'bg-blue-500', border: 'border-blue-400', text: 'text-blue-100' };
    return { bg: 'bg-white/80', border: 'border-white', text: 'text-gray-800' };
  };

  useEffect(() => {
    const lastReaction = textReactions[textReactions.length - 1];
    if (lastReaction) {
      const id = `${lastReaction.timestamp}-${lastReaction.playerId}-${Math.random()}`;
      const gender = getPlayerGender(lastReaction.playerId);
      const isFromMe = lastReaction.playerId === playerId;

      // Play sound only when receiving from OTHER player
      if (!isFromMe) {
        playSound('reactionReceived');
      }

      setFloatingReactions((prev) => [
        ...prev,
        { ...lastReaction, id, gender, isFromMe }
      ]);

      // Remove after animation (shorter for own reactions)
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
      }, isFromMe ? 1500 : 3000);
    }
  }, [textReactions, playerId, playSound]);

  return (
    <div className="fixed inset-x-0 top-20 pointer-events-none overflow-hidden z-50 flex flex-col items-center gap-2">
      <AnimatePresence>
        {floatingReactions.map((reaction) => {
          const style = getGenderStyle(reaction.gender);
          const isFromMe = reaction.isFromMe;

          return (
            <motion.div
              key={reaction.id}
              initial={{ opacity: 0, y: isFromMe ? 20 : -20, scale: 0.8 }}
              animate={{ opacity: isFromMe ? 0.8 : 1, y: 0, scale: isFromMe ? 0.85 : 1 }}
              exit={{ opacity: 0, y: isFromMe ? 20 : -30, scale: 0.8 }}
              transition={{ type: 'spring', damping: 20 }}
              className={`
                ${isFromMe ? 'bg-white/20 border-white/30' : `${style.bg} ${style.border}`}
                border-2 rounded-2xl px-4 py-2 shadow-xl
                flex items-center gap-2
              `}
            >
              {/* Emoji */}
              <motion.span
                className={isFromMe ? 'text-xl' : 'text-2xl'}
                animate={isFromMe ? {} : { rotate: [0, -10, 10, 0] }}
                transition={{ duration: 0.5 }}
              >
                {reaction.emoji}
              </motion.span>

              {/* Text */}
              <div className="text-center">
                <p className={`font-bold ${isFromMe ? 'text-sm text-white/90' : `text-base ${style.text}`}`}>
                  {reaction.text}
                </p>
                <p className={`text-xs font-medium ${isFromMe ? 'text-white/50' : 'text-white/70'}`}>
                  {isFromMe ? 'Envoyé ✓' : `- ${getPlayerName(reaction.playerId)}`}
                </p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
