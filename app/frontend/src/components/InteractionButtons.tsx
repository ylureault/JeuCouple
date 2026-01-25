import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BuzzData, KissData } from '../../../shared/types';
import { useAudio } from '../context/AudioContext';

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
      className={`px-3 py-2 rounded-xl font-bold text-sm transition-all text-white
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
  buzz: BuzzData | null;
  partnerName: string;
}

export function BuzzReceived({ buzz, partnerName }: BuzzReceivedProps) {
  const [showBuzz, setShowBuzz] = useState(false);

  useEffect(() => {
    if (buzz) {
      setShowBuzz(true);
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
      const timer = setTimeout(() => setShowBuzz(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [buzz]);

  return (
    <AnimatePresence>
      {showBuzz && (
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
              {partnerName} te buzz !
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface KissButtonProps {
  onKiss: () => void;
  kissCount: number;
  disabled?: boolean;
}

export function KissButton({ onKiss, kissCount, disabled }: KissButtonProps) {
  return (
    <motion.button
      onClick={onKiss}
      disabled={disabled}
      className="px-3 py-2 rounded-xl font-bold text-sm bg-gradient-to-r from-pink-500 to-red-500
                 hover:from-pink-400 hover:to-red-400 shadow-lg disabled:opacity-50 relative text-white"
      whileHover={!disabled ? { scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      <span className="mr-1">💋</span>
      Bisou
      {kissCount > 0 && (
        <motion.span
          key={kissCount}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-2 -right-2 bg-white text-pink-600 rounded-full
                     w-5 h-5 text-xs flex items-center justify-center font-bold"
        >
          {kissCount}
        </motion.span>
      )}
    </motion.button>
  );
}

interface KissReceivedProps {
  kiss: KissData | null;
  partnerName: string;
}

export function KissReceived({ kiss, partnerName }: KissReceivedProps) {
  const [showKiss, setShowKiss] = useState(false);
  const { playSound } = useAudio();

  useEffect(() => {
    if (kiss) {
      setShowKiss(true);
      playSound('kiss');
      const timer = setTimeout(() => setShowKiss(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [kiss, playSound]);

  return (
    <AnimatePresence>
      {showKiss && (
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
              Bisou de {partnerName} !
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface HesitationIndicatorProps {
  isHesitating: boolean;
  partnerName: string;
}

export function HesitationIndicator({ isHesitating, partnerName }: HesitationIndicatorProps) {
  return (
    <AnimatePresence>
      {isHesitating && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-20 left-1/2 transform -translate-x-1/2 z-40"
        >
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2">
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              🤔
            </motion.span>
            <span className="text-white font-semibold text-sm">
              {partnerName} hésite...
            </span>
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 bg-white/70 rounded-full"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
