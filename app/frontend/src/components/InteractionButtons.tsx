import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BuzzButtonProps {
  onBuzz: () => void;
  disabled?: boolean;
}

export function BuzzButton({ onBuzz, disabled }: BuzzButtonProps) {
  const [cooldown, setCooldown] = useState(false);

  const handleBuzz = () => {
    if (cooldown || disabled) return;
    onBuzz();
    setCooldown(true);
    setTimeout(() => setCooldown(false), 2000); // 2s cooldown
  };

  return (
    <motion.button
      onClick={handleBuzz}
      disabled={cooldown || disabled}
      className={`px-3 py-2 rounded-xl font-bold text-sm transition-all
                  ${cooldown
                    ? 'bg-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400'
                  }
                  shadow-lg disabled:opacity-50`}
      whileHover={!cooldown && !disabled ? { scale: 1.05 } : {}}
      whileTap={!cooldown && !disabled ? { scale: 0.95 } : {}}
    >
      <span className="mr-1">📳</span>
      Buzz!
    </motion.button>
  );
}

interface BuzzReceivedProps {
  show: boolean;
  fromPlayer: string;
}

export function BuzzReceived({ show, fromPlayer }: BuzzReceivedProps) {
  useEffect(() => {
    if (show && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 2 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: [2, 1, 1.1, 1],
            rotate: [0, -5, 5, -5, 5, 0]
          }}
          transition={{ duration: 1 }}
          className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
        >
          <div className="text-center bg-black/50 rounded-3xl p-8">
            <motion.span
              className="text-8xl block"
              animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
              transition={{ duration: 0.5, repeat: 2 }}
            >
              📳
            </motion.span>
            <p className="text-white font-bold text-xl mt-2">
              {fromPlayer} te buzz !
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface KissButtonProps {
  onKiss: () => void;
  totalKisses: number;
  disabled?: boolean;
}

export function KissButton({ onKiss, totalKisses, disabled }: KissButtonProps) {
  return (
    <motion.button
      onClick={onKiss}
      disabled={disabled}
      className="px-3 py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-pink-500 to-red-500
                 hover:from-pink-400 hover:to-red-400 shadow-lg disabled:opacity-50 relative"
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      <span className="mr-1">💋</span>
      Bisou
      {totalKisses > 0 && (
        <motion.span
          key={totalKisses}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-2 -right-2 bg-white text-pink-600 rounded-full
                     w-5 h-5 text-xs flex items-center justify-center font-bold"
        >
          {totalKisses}
        </motion.span>
      )}
    </motion.button>
  );
}

interface KissReceivedProps {
  show: boolean;
  fromPlayer: string;
}

export function KissReceived({ show, fromPlayer }: KissReceivedProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: -50 }}
          className="fixed top-1/3 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="text-center">
            <motion.span
              className="text-9xl block"
              animate={{
                scale: [1, 1.3, 1],
                rotate: [0, 10, -10, 0]
              }}
              transition={{ duration: 0.6 }}
            >
              💋
            </motion.span>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-white font-bold text-2xl mt-2 text-shadow-strong"
            >
              Bisou de {fromPlayer} !
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface HesitationIndicatorProps {
  isHesitating: boolean;
  playerName: string;
}

export function HesitationIndicator({ isHesitating, playerName }: HesitationIndicatorProps) {
  return (
    <AnimatePresence>
      {isHesitating && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1"
        >
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            🤔
          </motion.span>
          <span className="text-white/70 text-sm">
            {playerName} hésite...
          </span>
          <motion.span
            className="flex gap-0.5"
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 bg-white/50 rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
