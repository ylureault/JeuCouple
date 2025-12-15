import { motion } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { REACTION_EMOJIS } from '../../../shared/types';

export default function ReactionBar() {
  const { sendReaction } = useGame();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-center gap-2 flex-wrap"
    >
      {REACTION_EMOJIS.map((emoji) => (
        <motion.button
          key={emoji}
          onClick={() => sendReaction(emoji)}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-xl sm:text-2xl transition-colors"
        >
          {emoji}
        </motion.button>
      ))}
    </motion.div>
  );
}
