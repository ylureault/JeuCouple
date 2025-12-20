import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';

// Define locally to avoid Vite import issues with shared folder values
const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👏', '🔥', '😍', '🤔'] as const;

// Special animated versions of emojis
// @ts-ignore - complex animation types
const EMOJI_ANIMATIONS: Record<string, { animation: object; transition: object }> = {
  '❤️': {
    animation: { scale: [1, 1.3, 1], rotate: [0, -10, 10, 0] },
    transition: { duration: 0.5 }
  },
  '😂': {
    animation: { rotate: [-5, 5, -5, 5, 0], y: [0, -3, 0] },
    transition: { duration: 0.4 }
  },
  '😮': {
    animation: { scale: [1, 1.4, 1.2] },
    transition: { duration: 0.3 }
  },
  '😢': {
    animation: { y: [0, 2, 0], rotate: [-3, 3, 0] },
    transition: { duration: 0.5 }
  },
  '👏': {
    animation: { scale: [1, 0.9, 1.1, 0.95, 1], rotate: [-5, 5, -5, 0] },
    transition: { duration: 0.4 }
  },
  '🔥': {
    animation: { scale: [1, 1.2, 1], y: [0, -5, 0] },
    transition: { duration: 0.3 }
  },
  '😍': {
    animation: { scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] },
    transition: { duration: 0.5 }
  },
  '🤔': {
    animation: { rotate: [0, 15, 0], x: [0, 3, 0] },
    transition: { duration: 0.5 }
  }
};

export default function ReactionBar() {
  const { sendReaction } = useGame();
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [clickEffects, setClickEffects] = useState<{ id: string; emoji: string }[]>([]);

  const handleClick = (emoji: typeof REACTION_EMOJIS[number]) => {
    sendReaction(emoji);
    setLastClicked(emoji);

    // Add click effect
    const effectId = `${Date.now()}-${Math.random()}`;
    setClickEffects((prev) => [...prev, { id: effectId, emoji }]);
    setTimeout(() => {
      setClickEffects((prev) => prev.filter((e) => e.id !== effectId));
    }, 600);

    // Reset animation trigger
    setTimeout(() => setLastClicked(null), 500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-center gap-2 sm:gap-3 flex-wrap relative"
    >
      {REACTION_EMOJIS.map((emoji, index) => (
        <motion.button
          key={emoji}
          initial={{ opacity: 0, scale: 0, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: index * 0.05, type: 'spring', stiffness: 300 }}
          onClick={() => handleClick(emoji)}
          whileHover={{
            scale: 1.25,
            y: -5,
            transition: { type: 'spring', stiffness: 400 }
          }}
          whileTap={{ scale: 0.85 }}
          className="relative w-11 h-11 sm:w-14 sm:h-14 bg-white/10 hover:bg-white/25 rounded-full flex items-center justify-center transition-colors group"
        >
          {/* Glow effect on hover */}
          <motion.div
            className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
              filter: 'blur(8px)'
            }}
          />

          {/* Emoji with animation */}
          <motion.span
            className="text-2xl sm:text-3xl relative z-10"
            animate={lastClicked === emoji ? EMOJI_ANIMATIONS[emoji]?.animation : {}}
            transition={lastClicked === emoji ? EMOJI_ANIMATIONS[emoji]?.transition : {}}
          >
            {emoji}
          </motion.span>

          {/* Ripple effect on click */}
          <AnimatePresence>
            {clickEffects.filter((e) => e.emoji === emoji).map((effect) => (
              <motion.div
                key={effect.id}
                initial={{ scale: 0.5, opacity: 0.8 }}
                animate={{ scale: 2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 rounded-full border-2 border-white/50"
              />
            ))}
          </AnimatePresence>
        </motion.button>
      ))}

      {/* Flying emoji effect */}
      <AnimatePresence>
        {clickEffects.map((effect) => (
          <motion.div
            key={effect.id}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -60, scale: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute top-0 left-1/2 -translate-x-1/2 text-3xl pointer-events-none"
          >
            {effect.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
