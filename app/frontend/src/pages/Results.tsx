import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import MuteButton from '../components/MuteButton';
import Confetti from '../components/Confetti';
import type { CategoryScore } from '../../../shared/types';

// Category icons mapping
const CATEGORY_ICONS: Record<string, string> = {
  couple: '❤️',
  preferences: '⭐',
  habitudes: '🏠',
  souvenirs: '📸',
  projets: '🚀',
  sexy: '🔥',
  coquin: '😈',
  fun: '🎉'
};

// Firework burst component
function Firework({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  const colors = ['#ff0000', '#ffd700', '#00ff00', '#00bfff', '#ff1493', '#ff8c00'];
  const particles = 12;

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
    >
      {[...Array(particles)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-3 h-3 rounded-full"
          style={{
            backgroundColor: colors[i % colors.length],
            boxShadow: `0 0 6px ${colors[i % colors.length]}`
          }}
          initial={{ scale: 0, x: 0, y: 0 }}
          animate={{
            scale: [0, 1, 0],
            x: Math.cos((i * 360 / particles) * Math.PI / 180) * 80,
            y: Math.sin((i * 360 / particles) * Math.PI / 180) * 80,
            opacity: [1, 1, 0]
          }}
          transition={{
            delay: delay,
            duration: 1,
            ease: 'easeOut'
          }}
        />
      ))}
    </motion.div>
  );
}

// Category breakdown bar component
function CategoryBar({ category, delay = 0 }: { category: CategoryScore; delay?: number }) {
  const icon = CATEGORY_ICONS[category.category] || '📌';
  const compatColor = category.compatibility >= 80 ? 'bg-green-500' :
                      category.compatibility >= 60 ? 'bg-yellow-500' :
                      category.compatibility >= 40 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-3"
    >
      <span className="text-xl w-8">{icon}</span>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-semibold text-gray-700 capitalize">{category.category}</span>
          <span className="text-sm font-bold text-[#46178f]">{category.compatibility}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${category.compatibility}%` }}
            transition={{ delay: delay + 0.2, duration: 0.8, ease: 'easeOut' }}
            className={`h-full ${compatColor} rounded-full`}
          />
        </div>
      </div>
    </motion.div>
  );
}

export default function Results() {
  const { room, playerId, finalResults, restartGame } = useGame();
  const { playSound } = useAudio();
  const navigate = useNavigate();
  const [showPodium, setShowPodium] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [drumroll, setDrumroll] = useState(true);
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    if (!finalResults || !room) {
      navigate('/');
      return;
    }

    // Dramatic reveal sequence
    const timer0 = setTimeout(() => setDrumroll(false), 1500);
    const timer1 = setTimeout(() => setShowPodium(true), 1600);
    const timer2 = setTimeout(() => {
      setShowFireworks(true);
      playSound('fanfare');
    }, 2500);
    const timer3 = setTimeout(() => setShowStats(true), 3000);
    const timer4 = setTimeout(() => setShowCategories(true), 3500);

    return () => {
      clearTimeout(timer0);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [finalResults, room, navigate, playSound]);

  const handlePlayAgain = async () => {
    playSound('click');
    try {
      await restartGame();
      navigate('/game');
    } catch (error) {
      console.error('Failed to restart game:', error);
    }
  };

  if (!finalResults || !room) return null;

  const player1Name = room.player1_name || 'Joueur 1';
  const player2Name = room.player2_name || 'Joueur 2';

  const isWinner =
    (playerId === 1 && finalResults.winner === 1) ||
    (playerId === 2 && finalResults.winner === 2);

  const isTie = finalResults.winner === 'tie';

  const totalPoints = finalResults.score1 + finalResults.score2;
  const maxPoints = finalResults.totalQuestions * 200;
  const compatibility = Math.round((totalPoints / maxPoints) * 100);

  // Gamification stats
  const myMaxStreak = playerId === 1 ? finalResults.maxStreak1 : finalResults.maxStreak2;
  const mySpeedBonus = playerId === 1 ? finalResults.speedBonusTotal1 : finalResults.speedBonusTotal2;
  const bestCategory = finalResults.categoryScores?.[0];

  const getHeadline = () => {
    if (isTie) return { emoji: '🤝', text: 'Egalite parfaite !' };
    if (isWinner) return { emoji: '🏆', text: 'Tu as gagne !' };
    return { emoji: '💪', text: 'Belle tentative !' };
  };

  const getCompatibilityMessage = () => {
    if (compatibility >= 80) return { emoji: '💕', text: 'Vous vous connaissez par coeur !' };
    if (compatibility >= 60) return { emoji: '😊', text: 'Belle complicite !' };
    if (compatibility >= 40) return { emoji: '🌱', text: 'Votre histoire ne fait que commencer...' };
    return { emoji: '💬', text: 'Prenez le temps de vous decouvrir !' };
  };

  const headline = getHeadline();
  const compatMessage = getCompatibilityMessage();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0a2e] via-[#46178f] to-[#7b2cbf] flex flex-col overflow-hidden relative">
      <MuteButton />

      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-white/20 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.5, 0.2],
              scale: [1, 1.5, 1]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2
            }}
          />
        ))}
      </div>

      {/* Fireworks layer */}
      {showFireworks && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Confetti count={80} />
          <Firework x={20} y={20} delay={0} />
          <Firework x={80} y={25} delay={0.3} />
          <Firework x={50} y={15} delay={0.6} />
          <Firework x={30} y={35} delay={0.9} />
          <Firework x={70} y={40} delay={1.2} />
        </div>
      )}

      {/* Drumroll overlay */}
      <AnimatePresence>
        {drumroll && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 2 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-50 bg-[#1a0a2e] flex items-center justify-center"
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="text-center"
            >
              <motion.div className="text-8xl mb-4">🥁</motion.div>
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="text-3xl font-black text-white"
              >
                Les resultats arrivent...
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div
        initial={{ y: -200, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.6, type: 'spring', damping: 15 }}
        className="text-center pt-6 pb-2 relative z-10"
      >
        <motion.div
          initial={{ scale: 0, rotate: -720 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 1.8, type: 'spring', damping: 8, stiffness: 80 }}
          className="text-7xl mb-2"
        >
          <motion.span
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 10, -10, 0]
            }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          >
            {headline.emoji}
          </motion.span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 2.2, type: 'spring', damping: 15 }}
          className="text-4xl md:text-5xl font-black text-white text-shadow-strong"
        >
          {headline.text}
        </motion.h1>
      </motion.div>

      {/* Podium */}
      <div className="flex-1 flex items-end justify-center px-4 pb-4">
        <AnimatePresence>
          {showPodium && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-end justify-center gap-4 w-full max-w-lg"
            >
              {/* Player 1 */}
              <PodiumColumn
                name={player1Name}
                score={finalResults.score1}
                isWinner={finalResults.winner === 1}
                isTie={isTie}
                isYou={playerId === 1}
                rank={finalResults.winner === 2 ? 2 : 1}
                delay={0.3}
                emoji="👩"
              />

              {/* VS */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="pb-16 text-white/30 text-2xl font-black"
              >
                VS
              </motion.div>

              {/* Player 2 */}
              <PodiumColumn
                name={player2Name}
                score={finalResults.score2}
                isWinner={finalResults.winner === 2}
                isTie={isTie}
                isYou={playerId === 2}
                rank={finalResults.winner === 1 ? 2 : 1}
                delay={0.4}
                emoji="👨"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats & Actions */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ y: 200 }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className="bg-white rounded-t-3xl p-5 md:p-6 max-h-[60vh] overflow-y-auto"
          >
            <div className="max-w-lg mx-auto">
              {/* Compatibility score */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-4"
              >
                <div className="inline-flex items-center gap-3 bg-[#46178f]/10 rounded-full px-5 py-2">
                  <span className="text-2xl">{compatMessage.emoji}</span>
                  <div className="text-left">
                    <p className="text-[#46178f] font-black text-2xl">
                      {compatibility}%
                    </p>
                    <p className="text-gray-600 font-semibold text-xs">
                      de compatibilite
                    </p>
                  </div>
                </div>
                <p className="text-gray-500 mt-2 font-semibold text-sm">
                  {compatMessage.text}
                </p>
              </motion.div>

              {/* Gamification highlights */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap justify-center gap-2 mb-4"
              >
                {myMaxStreak >= 2 && (
                  <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 rounded-full px-3 py-1 text-sm font-bold">
                    🔥 Serie max: {myMaxStreak}
                  </span>
                )}
                {mySpeedBonus > 0 && (
                  <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 rounded-full px-3 py-1 text-sm font-bold">
                    ⚡ Bonus rapidite: +{mySpeedBonus}
                  </span>
                )}
                {finalResults.perfectMatches > 0 && (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 rounded-full px-3 py-1 text-sm font-bold">
                    🎯 Parfaits: {finalResults.perfectMatches}
                  </span>
                )}
              </motion.div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatBox
                  value={finalResults.totalQuestions}
                  label="Questions"
                  emoji="❓"
                  delay={0.1}
                />
                <StatBox
                  value={finalResults.score1 + finalResults.score2}
                  label="Points"
                  emoji="⭐"
                  delay={0.2}
                />
                <StatBox
                  value={finalResults.correctAnswers1}
                  label="Matches"
                  emoji="🤝"
                  delay={0.3}
                />
              </div>

              {/* Category breakdown */}
              {showCategories && finalResults.categoryScores && finalResults.categoryScores.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ delay: 0.2 }}
                  className="mb-4"
                >
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 text-center">
                    Compatibilite par categorie
                  </h3>
                  <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                    {finalResults.categoryScores.slice(0, 5).map((cat, idx) => (
                      <CategoryBar key={cat.category} category={cat} delay={0.1 * idx} />
                    ))}
                  </div>
                  {bestCategory && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="text-center mt-3 text-sm text-[#46178f] font-semibold"
                    >
                      {CATEGORY_ICONS[bestCategory.category] || '💡'} Votre force : <span className="capitalize">{bestCategory.category}</span> ({bestCategory.compatibility}%)
                    </motion.p>
                  )}
                </motion.div>
              )}

              {/* Play again button */}
              <motion.button
                initial={{ y: 50, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                onClick={handlePlayAgain}
                className="btn-create w-full text-lg relative overflow-hidden group"
                whileHover={{ scale: 1.03, y: -3 }}
                whileTap={{ scale: 0.97 }}
              >
                {/* Button shine effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '200%' }}
                  transition={{ duration: 0.6 }}
                />
                <span className="flex items-center justify-center gap-3 relative z-10">
                  <span className="text-xl">🔄</span>
                  Rejouer
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface PodiumColumnProps {
  name: string;
  score: number;
  isWinner: boolean;
  isTie: boolean;
  isYou: boolean;
  rank: 1 | 2;
  delay: number;
  emoji: string;
}

function PodiumColumn({
  name,
  score,
  isWinner,
  isTie,
  isYou,
  rank,
  delay,
  emoji
}: PodiumColumnProps) {
  const height = isWinner || isTie ? 160 : 120;
  const bgGradient = isWinner || isTie
    ? 'from-[#ffd700] via-[#ffec8b] to-[#b8860b]'
    : 'from-[#c0c0c0] via-[#e8e8e8] to-[#a0a0a0]';

  return (
    <motion.div
      initial={{ y: 300, opacity: 0, scale: 0.5 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 12, stiffness: 100 }}
      className="flex flex-col items-center flex-1 max-w-[140px] relative"
    >
      {/* Glow effect for winner */}
      {(isWinner || isTie) && (
        <motion.div
          className="absolute -inset-4 rounded-full bg-yellow-400/20 blur-xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Crown for winner with bounce */}
      {(isWinner || isTie) && (
        <motion.div
          initial={{ y: -100, opacity: 0, scale: 0, rotate: -180 }}
          animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: delay + 0.5, type: 'spring', stiffness: 200, damping: 10 }}
          className="text-4xl mb-1 relative z-10"
        >
          <motion.span
            animate={{
              y: [0, -8, 0],
              rotate: [0, 10, -10, 0]
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            👑
          </motion.span>
        </motion.div>
      )}

      {/* Avatar with glow */}
      <motion.div
        initial={{ scale: 0, rotate: -360 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: delay + 0.2, type: 'spring', stiffness: 150 }}
        className={`
          w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1 relative z-10
          shadow-2xl border-4
          ${isWinner || isTie ? 'bg-gradient-to-br from-[#ffd700] to-[#ff8c00] border-white' : 'bg-gradient-to-br from-[#9ca3af] to-[#6b7280] border-white/50'}
        `}
      >
        <motion.span
          animate={(isWinner || isTie) ? {
            scale: [1, 1.1, 1]
          } : {}}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
        >
          {emoji}
        </motion.span>
      </motion.div>

      {/* Name with emphasis */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.3 }}
        className={`
          font-bold text-center mb-1 truncate w-full relative z-10 text-sm
          ${isWinner || isTie ? 'text-yellow-200' : 'text-white'}
        `}
      >
        {name}
      </motion.p>
      {isYou && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.4, type: 'spring' }}
          className="text-xs bg-white/30 text-white px-2 py-0.5 rounded-full mb-1 font-bold relative z-10"
        >
          Toi
        </motion.span>
      )}

      {/* Podium bar with dramatic rise */}
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height, opacity: 1 }}
        transition={{ delay: delay + 0.3, duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        className={`
          w-full bg-gradient-to-t ${bgGradient} rounded-t-2xl
          flex flex-col items-center justify-start pt-3 relative overflow-hidden
          shadow-2xl
        `}
      >
        {/* Animated shine sweep */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ delay: delay + 1, duration: 1, repeat: Infinity, repeatDelay: 3 }}
        />

        {/* Rank with pop effect */}
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.6, type: 'spring', stiffness: 200 }}
          className={`
            text-4xl font-black drop-shadow-lg relative z-10
            ${isWinner || isTie ? 'text-white' : 'text-white/80'}
          `}
        >
          #{rank}
        </motion.span>

        {/* Score with counter animation */}
        <motion.div
          initial={{ scale: 0, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: delay + 0.8, type: 'spring', stiffness: 200 }}
          className={`
            mt-2 rounded-xl px-4 py-1 relative z-10
            ${isWinner || isTie ? 'bg-black/30' : 'bg-white/20'}
          `}
        >
          <motion.span
            className="text-2xl font-black text-white"
            animate={score > 0 ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <AnimatedCounter value={score} duration={1500} />
          </motion.span>
          <span className="text-white/60 text-xs ml-1 font-bold">pts</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// AnimatedCounter used in PodiumColumn
function AnimatedCounter({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(interval);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value, duration]);

  return <>{count}</>;
}

interface StatBoxProps {
  value: number;
  label: string;
  emoji: string;
  delay?: number;
}

function StatBox({ value, label, emoji, delay = 0 }: StatBoxProps) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -10 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ delay, type: 'spring', stiffness: 200, damping: 15 }}
      whileHover={{ scale: 1.05, y: -3 }}
      className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 text-center shadow-lg relative overflow-hidden"
    >
      {/* Shine effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
        initial={{ x: '-100%' }}
        animate={{ x: '200%' }}
        transition={{ delay: delay + 0.5, duration: 0.8 }}
      />
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: delay + 0.1, type: 'spring' }}
        className="text-2xl block"
      >
        {emoji}
      </motion.span>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.2 }}
        className="text-2xl font-black text-[#46178f] mt-1"
      >
        <AnimatedCounter value={value} duration={1200} />
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.3 }}
        className="text-gray-500 text-xs font-bold uppercase tracking-wide"
      >
        {label}
      </motion.p>
    </motion.div>
  );
}
