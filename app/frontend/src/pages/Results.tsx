import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import MuteButton from '../components/MuteButton';
import Confetti from '../components/Confetti';

export default function Results() {
  const { room, playerId, finalResults, resetGame } = useGame();
  const { playSound } = useAudio();
  const navigate = useNavigate();
  const [showPodium, setShowPodium] = useState(false);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    if (!finalResults || !room) {
      navigate('/');
      return;
    }

    // Staggered reveal
    const timer1 = setTimeout(() => setShowPodium(true), 500);
    const timer2 = setTimeout(() => {
      setShowStats(true);
      playSound('fanfare');
    }, 1500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [finalResults, room, navigate, playSound]);

  const handlePlayAgain = () => {
    playSound('click');
    resetGame();
    navigate('/');
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
    <div className="min-h-screen bg-[#46178f] flex flex-col overflow-hidden">
      <MuteButton />

      {showStats && <Confetti count={50} />}

      {/* Header */}
      <motion.div
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        className="text-center pt-8 pb-4"
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', damping: 12 }}
          className="text-8xl mb-4"
        >
          {headline.emoji}
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-4xl md:text-5xl font-black text-white text-shadow-strong"
        >
          {headline.text}
        </motion.h1>
      </motion.div>

      {/* Podium */}
      <div className="flex-1 flex items-end justify-center px-4 pb-6">
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
                className="pb-20 text-white/30 text-2xl font-black"
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
            className="bg-white rounded-t-3xl p-6 md:p-8"
          >
            <div className="max-w-lg mx-auto">
              {/* Compatibility score */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-6"
              >
                <div className="inline-flex items-center gap-3 bg-[#46178f]/10 rounded-full px-6 py-3">
                  <span className="text-3xl">{compatMessage.emoji}</span>
                  <div className="text-left">
                    <p className="text-[#46178f] font-black text-3xl">
                      {compatibility}%
                    </p>
                    <p className="text-gray-600 font-semibold text-sm">
                      de compatibilite
                    </p>
                  </div>
                </div>
                <p className="text-gray-500 mt-3 font-semibold">
                  {compatMessage.text}
                </p>
              </motion.div>

              {/* Stats grid */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="grid grid-cols-3 gap-4 mb-6"
              >
                <StatBox
                  value={finalResults.totalQuestions}
                  label="Questions"
                  emoji="❓"
                />
                <StatBox
                  value={finalResults.score1 + finalResults.score2}
                  label="Points totaux"
                  emoji="⭐"
                />
                <StatBox
                  value={isTie ? 2 : 1}
                  label={isTie ? 'Gagnants' : 'Gagnant'}
                  emoji="🏆"
                />
              </motion.div>

              {/* Play again button */}
              <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                onClick={handlePlayAgain}
                className="btn-create w-full text-xl"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-2xl">🔄</span>
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
  const height = isWinner || isTie ? 180 : 140;
  const bgGradient = isWinner || isTie
    ? 'from-[#ffd700] to-[#b8860b]'
    : 'from-[#c0c0c0] to-[#a0a0a0]';

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, type: 'spring', damping: 15 }}
      className="flex flex-col items-center flex-1 max-w-[140px]"
    >
      {/* Crown for winner */}
      {(isWinner || isTie) && (
        <motion.div
          initial={{ y: -20, opacity: 0, scale: 0 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ delay: delay + 0.3, type: 'spring' }}
          className="text-4xl mb-2"
        >
          👑
        </motion.div>
      )}

      {/* Avatar */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: delay + 0.1, type: 'spring' }}
        className={`
          w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-2
          ${isWinner || isTie ? 'bg-[#ffd700]/20' : 'bg-white/20'}
        `}
      >
        {emoji}
      </motion.div>

      {/* Name */}
      <p className="text-white font-bold text-center mb-1 truncate w-full">
        {name}
      </p>
      {isYou && (
        <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full mb-2">
          Toi
        </span>
      )}

      {/* Podium bar */}
      <motion.div
        initial={{ height: 0 }}
        animate={{ height }}
        transition={{ delay: delay + 0.2, duration: 0.5, ease: 'easeOut' }}
        className={`
          w-full bg-gradient-to-t ${bgGradient} rounded-t-xl
          flex flex-col items-center justify-start pt-4 relative overflow-hidden
        `}
      >
        {/* Shine effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Rank */}
        <span className="text-4xl font-black text-white/80 drop-shadow-lg">
          #{rank}
        </span>

        {/* Score */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.5, type: 'spring' }}
          className="mt-2 bg-white/20 rounded-lg px-4 py-2"
        >
          <span className="text-2xl font-black text-white">
            {score}
          </span>
          <span className="text-white/60 text-sm ml-1">pts</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

interface StatBoxProps {
  value: number;
  label: string;
  emoji: string;
}

function StatBox({ value, label, emoji }: StatBoxProps) {
  return (
    <div className="bg-gray-100 rounded-xl p-4 text-center">
      <span className="text-2xl">{emoji}</span>
      <p className="text-2xl font-black text-gray-900 mt-1">{value}</p>
      <p className="text-gray-500 text-xs font-semibold uppercase">{label}</p>
    </div>
  );
}
