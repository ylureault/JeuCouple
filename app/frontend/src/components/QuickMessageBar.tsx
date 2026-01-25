import { motion, AnimatePresence } from 'framer-motion';
import { QUICK_MESSAGES, type QuickMessageId } from '../../../shared/types';

interface QuickMessageBarProps {
  onSend: (messageId: QuickMessageId) => void;
  disabled?: boolean;
}

export default function QuickMessageBar({ onSend, disabled }: QuickMessageBarProps) {
  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {QUICK_MESSAGES.map((msg) => (
        <motion.button
          key={msg.id}
          onClick={() => onSend(msg.id as QuickMessageId)}
          disabled={disabled}
          className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded-full text-xs text-white/80
                     hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-1"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span>{msg.emoji}</span>
          <span className="hidden sm:inline">{msg.text}</span>
        </motion.button>
      ))}
    </div>
  );
}

interface QuickMessageDisplayProps {
  message: { text: string; emoji: string; playerId: 1 | 2 } | null;
  playerNames: { player1: string; player2: string };
}

export function QuickMessageDisplay({ message, playerNames }: QuickMessageDisplayProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.8 }}
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50
                     bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 shadow-2xl
                     border-2 border-white/30"
        >
          <div className="text-center">
            <p className="text-white/70 text-sm mb-1">
              {message.playerId === 1 ? playerNames.player1 : playerNames.player2} dit :
            </p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl">{message.emoji}</span>
              <span className="text-white font-bold text-xl">{message.text}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
