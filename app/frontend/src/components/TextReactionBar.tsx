import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';

// Define locally to avoid Vite import issues with shared folder values
const TEXT_REACTIONS = [
  { id: 'jetaime', text: "Je t'aime", emoji: '❤️' },
  { id: 'bisou', text: 'Bisou', emoji: '💋' },
  { id: 'ptitcon', text: "P'tit con", emoji: '😏' },
  { id: 'nul', text: "T'es nul(le)", emoji: '😜' },
  { id: 'bravo', text: 'Bravo !', emoji: '👏' },
  { id: 'allez', text: 'Allez !', emoji: '💪' },
  { id: 'habon', text: 'Ah bon ?', emoji: '🤨' },
  { id: 'mechant', text: 'Méchant(e)', emoji: '😤' },
] as const;

export default function TextReactionBar() {
  const { sendTextReaction } = useGame();
  const { playSound } = useAudio();
  const [lastClicked, setLastClicked] = useState<string | null>(null);

  const handleClick = (reactionId: string) => {
    sendTextReaction(reactionId as typeof TEXT_REACTIONS[number]['id']);
    playSound('click');
    setLastClicked(reactionId);
    setTimeout(() => setLastClicked(null), 300);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap justify-center gap-1.5 px-2"
    >
      {TEXT_REACTIONS.map((reaction, index) => (
        <motion.button
          key={reaction.id}
          initial={{ opacity: 0, scale: 0, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: index * 0.03, type: 'spring', stiffness: 300 }}
          onClick={() => handleClick(reaction.id)}
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
          className={`
            relative px-2 py-1 rounded-full text-xs font-semibold transition-all
            ${lastClicked === reaction.id
              ? 'bg-white text-[#a3235e] scale-105'
              : 'bg-white/15 text-white hover:bg-white/25'
            }
          `}
        >
          <span className="mr-1">{reaction.emoji}</span>
          <span>{reaction.text}</span>

          {/* Ripple effect */}
          <AnimatePresence>
            {lastClicked === reaction.id && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0.8 }}
                animate={{ scale: 2, opacity: 0 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-full border-2 border-white"
              />
            )}
          </AnimatePresence>
        </motion.button>
      ))}
    </motion.div>
  );
}
