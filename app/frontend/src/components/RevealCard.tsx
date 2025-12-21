import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useMemo } from 'react';
import type { Question, GameRevealData } from '../../../shared/types';
import Confetti from './Confetti';
import Fireworks from './Fireworks';

interface RevealCardProps {
  question: Question;
  revealData: GameRevealData;
  player1Name: string;
  player2Name: string;
  playerId: 1 | 2;
  currentScore1: number;
  currentScore2: number;
}

// Animator messages - funny quotes and motivating text
const MATCH_MESSAGES = [
  "Vous êtes sur la même longueur d'onde ! 🌊",
  "Télépathie de couple activée ! 🔮",
  "C'est beau l'amour ! 💕",
  "Incroyable synchronisation ! ⚡",
  "Vous vous connaissez par cœur ! 💖",
  "Match parfait ! Comme au premier jour ! 🎯",
  "Les esprits se rencontrent ! 🧠💕🧠",
];

const MISMATCH_MESSAGES = [
  "Oups... Faut qu'on parle ! 😅",
  "C'est l'occasion de mieux se découvrir ! 💬",
  "Pas grave, l'important c'est de communiquer ! 🗣️",
  "Au moins vous apprenez quelque chose ! 📚",
  "La vie serait ennuyeuse si on pensait pareil ! 🤷",
  "C'est ça qui rend le couple intéressant ! ✨",
];

const FAKE_QUOTES = [
  { author: "Albert Einstein", quote: "L'amour, c'est comme les maths... Ça ne s'explique pas." },
  { author: "Confucius", quote: "Celui qui ne connaît pas son partenaire finit par dormir sur le canapé." },
  { author: "Socrate", quote: "Je sais que je ne sais rien... surtout sur ma femme." },
  { author: "Napoléon", quote: "En amour comme à la guerre, il faut savoir battre en retraite." },
  { author: "Cléopâtre", quote: "Un couple qui joue ensemble reste ensemble." },
  { author: "Shakespeare", quote: "Être ou ne pas être d'accord, telle est la question du couple." },
  { author: "Marie Curie", quote: "La radioactivité dans un couple, c'est la passion !" },
  { author: "De Vinci", quote: "L'art de l'amour se pratique à deux pinceaux." },
];

const getAnimatorMessage = (correct: boolean, streak: number, player1: string, player2: string) => {
  if (correct && streak >= 3) {
    return `🔥 ${player1} et ${player2} sont EN FEU ! Série de ${streak} !`;
  }
  if (correct) {
    return MATCH_MESSAGES[Math.floor(Math.random() * MATCH_MESSAGES.length)];
  }
  return MISMATCH_MESSAGES[Math.floor(Math.random() * MISMATCH_MESSAGES.length)];
};

const getFakeQuote = () => {
  return FAKE_QUOTES[Math.floor(Math.random() * FAKE_QUOTES.length)];
};

// Flying emojis component for celebrations
function FlyingEmojis({ emojis, count = 8 }: { emojis: string[]; count?: number }) {
  const [particles, setParticles] = useState<Array<{ id: number; emoji: string; x: number; delay: number }>>([]);

  useEffect(() => {
    const newParticles = Array.from({ length: count }, (_, i) => ({
      id: i,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      x: Math.random() * 100,
      delay: Math.random() * 0.5
    }));
    setParticles(newParticles);
  }, [emojis, count]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: '100vh', x: `${p.x}vw`, opacity: 1, scale: 1 }}
          animate={{ y: '-20vh', opacity: 0, scale: 0.5, rotate: 360 }}
          transition={{ duration: 2, delay: p.delay, ease: 'easeOut' }}
          className="absolute text-4xl"
        >
          {p.emoji}
        </motion.div>
      ))}
    </div>
  );
}

// Streak badge component
function StreakBadge({ streak }: { streak: number }) {
  if (streak < 2) return null;

  const getStreakEmoji = () => {
    if (streak >= 5) return '💎';
    if (streak >= 4) return '🔥';
    if (streak >= 3) return '⚡';
    return '⭐';
  };

  const getMultiplier = () => {
    if (streak >= 5) return 'x2.0';
    if (streak >= 4) return 'x1.75';
    if (streak >= 3) return 'x1.5';
    return 'x1.2';
  };

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
      className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 rounded-full px-4 py-2 shadow-lg"
    >
      <motion.span
        animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
        transition={{ duration: 0.6, repeat: Infinity }}
        className="text-2xl"
      >
        {getStreakEmoji()}
      </motion.span>
      <span className="font-black text-white">
        Série de {streak} !
      </span>
      <span className="bg-white/30 rounded-full px-2 py-0.5 text-white font-bold text-sm">
        {getMultiplier()}
      </span>
    </motion.div>
  );
}

// Speed bonus badge
function SpeedBonusBadge({ bonus, time }: { bonus: number; time: number | null }) {
  if (bonus <= 0 || !time) return null;

  const isFast = time <= 5;

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.5, type: 'spring' }}
      className={`
        inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold
        ${isFast ? 'bg-yellow-400 text-yellow-900' : 'bg-blue-400 text-blue-900'}
      `}
    >
      <motion.span
        animate={{ x: [0, 5, 0] }}
        transition={{ duration: 0.3, repeat: 3 }}
      >
        ⚡
      </motion.span>
      <span>RAPIDE +{bonus}</span>
    </motion.div>
  );
}

export default function RevealCard({
  question,
  revealData,
  player1Name,
  player2Name,
  playerId,
  currentScore1,
  currentScore2
}: RevealCardProps) {
  const {
    answer1, answer2, correct, points1, points2, questionType,
    basePoints, speedBonus1, speedBonus2, streakBonus1, streakBonus2,
    streak1, streak2, answerTime1, answerTime2, correctAnswer
  } = revealData;
  const [showFlash, setShowFlash] = useState(false);
  const [countedPoints, setCountedPoints] = useState(0);

  const myPoints = playerId === 1 ? points1 : points2;
  const myStreak = playerId === 1 ? streak1 : streak2;
  const mySpeedBonus = playerId === 1 ? speedBonus1 : speedBonus2;
  const myStreakBonus = playerId === 1 ? streakBonus1 : streakBonus2;
  const myAnswerTime = playerId === 1 ? answerTime1 : answerTime2;

  const showPoints = questionType !== 'C' || basePoints > 0;
  const answersMatch = answer1 === answer2;
  const hasBonus = mySpeedBonus > 0 || myStreakBonus > 0;

  // Memoized animator message and fake quote (so they don't change on re-render)
  const animatorMessage = useMemo(
    () => getAnimatorMessage(correct, myStreak, player1Name, player2Name),
    [correct, myStreak, player1Name, player2Name]
  );
  const fakeQuote = useMemo(() => getFakeQuote(), []);

  // Lightning flash on reveal
  useEffect(() => {
    if (showPoints && correct) {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 200);
    }
  }, [showPoints, correct]);

  // Animated point counter
  useEffect(() => {
    if (myPoints > 0) {
      const duration = 600;
      const steps = 20;
      const increment = myPoints / steps;
      let current = 0;
      const interval = setInterval(() => {
        current += increment;
        if (current >= myPoints) {
          setCountedPoints(myPoints);
          clearInterval(interval);
        } else {
          setCountedPoints(Math.floor(current));
        }
      }, duration / steps);
      return () => clearInterval(interval);
    }
  }, [myPoints]);

  // Determine who's leading
  const leader = currentScore1 > currentScore2 ? 1 : currentScore2 > currentScore1 ? 2 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-2 relative"
    >
      {/* Lightning flash effect */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white z-50 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Flying emojis and fireworks for correct answers */}
      {correct && showPoints && myPoints > 0 && (
        <>
          <Fireworks />
          <Confetti count={50} />
          <FlyingEmojis emojis={['💖', '✨', '🌟', '💕', '🎊', '💫']} count={12} />
        </>
      )}

      {/* Question reminder */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white/10 backdrop-blur rounded-lg p-2 mb-1"
      >
        <p className="text-white/90 text-sm text-center font-medium leading-tight">
          {question.text}
        </p>
      </motion.div>

      {/* Kahoot-style Scoreboard */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-black/40 backdrop-blur rounded-xl p-2 mb-2"
      >
        <div className="flex items-center justify-between gap-2">
          {/* Player 1 score */}
          <motion.div
            className={`flex-1 rounded-lg p-2 text-center relative overflow-hidden ${
              leader === 1 ? 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30 ring-2 ring-yellow-400' : 'bg-white/10'
            }`}
            animate={points1 > 0 ? { scale: [1, 1.05, 1] } : {}}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            {leader === 1 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -left-1 text-lg"
              >
                👑
              </motion.span>
            )}
            <p className="text-white/70 text-xs font-semibold truncate">{player1Name}</p>
            <div className="flex items-center justify-center gap-1">
              <motion.span
                key={currentScore1}
                initial={{ scale: 1.3, color: '#22c55e' }}
                animate={{ scale: 1, color: '#ffffff' }}
                className="text-xl font-black text-white"
              >
                {currentScore1}
              </motion.span>
              {points1 > 0 && (
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-green-400 text-xs font-bold"
                >
                  +{points1}
                </motion.span>
              )}
            </div>
          </motion.div>

          {/* VS divider */}
          <div className="text-white/40 font-bold text-sm">VS</div>

          {/* Player 2 score */}
          <motion.div
            className={`flex-1 rounded-lg p-2 text-center relative overflow-hidden ${
              leader === 2 ? 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30 ring-2 ring-yellow-400' : 'bg-white/10'
            }`}
            animate={points2 > 0 ? { scale: [1, 1.05, 1] } : {}}
            transition={{ delay: 0.3, duration: 0.3 }}
          >
            {leader === 2 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 text-lg"
              >
                👑
              </motion.span>
            )}
            <p className="text-white/70 text-xs font-semibold truncate">{player2Name}</p>
            <div className="flex items-center justify-center gap-1">
              <motion.span
                key={currentScore2}
                initial={{ scale: 1.3, color: '#22c55e' }}
                animate={{ scale: 1, color: '#ffffff' }}
                className="text-xl font-black text-white"
              >
                {currentScore2}
              </motion.span>
              {points2 > 0 && (
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-green-400 text-xs font-bold"
                >
                  +{points2}
                </motion.span>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Streak badge */}
      {myStreak >= 2 && correct && (
        <div className="flex justify-center mb-2">
          <StreakBadge streak={myStreak} />
        </div>
      )}

      {/* Animator message */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-lg p-3 text-center"
      >
        <p className="text-white font-bold text-sm sm:text-base">
          {animatorMessage}
        </p>
      </motion.div>

      {/* Wrong answer shake effect - applies to container */}
      <motion.div
        animate={!correct && questionType !== 'C' ? {
          x: [0, -15, 15, -10, 10, -5, 5, 0],
          transition: { duration: 0.5 }
        } : {}}
      >
        {/* Result banner */}
        <motion.div
          initial={{ scale: 0, rotate: -180, y: -50 }}
          animate={{ scale: 1, rotate: 0, y: 0 }}
          transition={{ type: 'spring', damping: 12, stiffness: 100 }}
          className={`
            rounded-xl p-3 sm:p-4 text-center shadow-xl relative overflow-hidden
            ${correct && showPoints && myPoints > 0 && questionType !== 'H' ? 'bg-gradient-to-br from-[#26890c] to-[#1a5e08] glow-green' : ''}
            ${!correct && questionType !== 'C' && questionType !== 'H' ? 'bg-gradient-to-br from-[#e21b3c] to-[#9c1229] glow-red' : ''}
            ${questionType === 'C' ? 'bg-gradient-to-br from-[#9c27b0] to-[#6a1b7a]' : ''}
            ${questionType === 'H' ? 'bg-gradient-to-br from-[#673ab7] to-[#512da8]' : ''}
          `}
        >
          {/* Animated background shimmer */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-200%', '200%'] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
          />

          {questionType !== 'C' && questionType !== 'H' && (
            <div className="relative z-10">
              {/* Main emoji with dramatic entrance */}
              <motion.div
                initial={{ scale: 0, rotate: -360 }}
                animate={{
                  scale: [0, 1.3, 1],
                  rotate: [0, 180, 0]
                }}
                transition={{
                  duration: 0.6,
                  times: [0, 0.6, 1],
                  type: 'spring',
                  damping: 10
                }}
                className="text-4xl mb-1"
              >
                <motion.span
                  animate={correct ? {
                    scale: [1, 1.15, 1],
                    rotate: [0, 8, -8, 0]
                  } : {}}
                  transition={{ duration: 0.5, repeat: correct ? Infinity : 0, repeatDelay: 1 }}
                >
                  {correct ? '🎉' : '💔'}
                </motion.span>
              </motion.div>

              {/* Title with typing effect */}
              <motion.h2
                initial={{ y: 30, opacity: 0, scale: 0.5 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, type: 'spring', damping: 15 }}
                className="text-xl sm:text-2xl font-black text-white mb-2 text-shadow-strong"
              >
                {answersMatch ? 'Vous pensez pareil !' : 'Pas cette fois...'}
              </motion.h2>

              {/* Points counter with dramatic animation */}
              {myPoints > 0 && (
                <motion.div
                  initial={{ scale: 0, y: 30 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                  className="inline-block relative"
                >
                  <motion.div
                    className="bg-white/20 backdrop-blur rounded-full px-4 py-1 relative overflow-hidden"
                    animate={{
                      boxShadow: [
                        '0 0 0 0 rgba(255,255,255,0.4)',
                        '0 0 0 15px rgba(255,255,255,0)',
                      ]
                    }}
                    transition={{ duration: 1, repeat: 2 }}
                  >
                    <motion.span
                      className="text-xl font-black text-white"
                      key={countedPoints}
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ duration: 0.1 }}
                    >
                      +{countedPoints} pts
                    </motion.span>
                  </motion.div>

                  {/* Sparkle effects around points */}
                  {[...Array(4)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute text-lg"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: [0, 1, 0],
                        scale: [0, 1, 0],
                        x: [0, (i % 2 ? 1 : -1) * 30],
                        y: [0, (i < 2 ? -1 : 1) * 20]
                      }}
                      transition={{ delay: 0.7 + i * 0.1, duration: 0.5 }}
                      style={{
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      ✨
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Bonus breakdown */}
              {hasBonus && myPoints > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="flex flex-wrap justify-center gap-1 mt-2"
                >
                  <span className="bg-white/20 rounded-full px-2 py-0.5 text-white/80 text-xs font-semibold">
                    Base: {basePoints}
                  </span>
                  {mySpeedBonus > 0 && (
                    <SpeedBonusBadge bonus={mySpeedBonus} time={myAnswerTime} />
                  )}
                  {myStreakBonus > 0 && (
                    <span className="bg-orange-500/80 rounded-full px-2 py-0.5 text-white text-xs font-bold">
                      🔥 +{myStreakBonus}
                    </span>
                  )}
                </motion.div>
              )}
            </div>
          )}

          {questionType === 'C' && (
            <div className="relative z-10">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 10 }}
                className="text-4xl mb-2"
              >
                💬
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl font-black text-white"
              >
                Comparez vos réponses !
              </motion.h2>
              {basePoints > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-white/80 mt-1 text-sm"
                >
                  +{basePoints} points pour vos réponses !
                </motion.p>
              )}
            </div>
          )}

          {questionType === 'H' && (
            <div className="relative z-10">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 10 }}
                className="text-4xl mb-2"
              >
                🧠
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl font-black text-white mb-2"
              >
                Culture Générale
              </motion.h2>

              {/* Correct answer */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="bg-white/20 backdrop-blur rounded-lg p-2 mb-2"
              >
                <p className="text-white/70 text-xs">Bonne réponse :</p>
                <p className="text-white font-bold text-base">{correctAnswer}</p>
              </motion.div>

              {/* Individual results */}
              <div className="grid grid-cols-2 gap-2">
                <motion.div
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 }}
                  className={`rounded-lg p-2 ${answer1 === correctAnswer ? 'bg-green-500/30' : 'bg-red-500/30'}`}
                >
                  <p className="text-white/70 text-xs">{player1Name}</p>
                  <p className="text-xl">{answer1 === correctAnswer ? '✅' : '❌'}</p>
                  <p className="text-white font-bold text-sm">+{points1} pts</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 }}
                  className={`rounded-lg p-2 ${answer2 === correctAnswer ? 'bg-green-500/30' : 'bg-red-500/30'}`}
                >
                  <p className="text-white/70 text-xs">{player2Name}</p>
                  <p className="text-xl">{answer2 === correctAnswer ? '✅' : '❌'}</p>
                  <p className="text-white font-bold text-sm">+{points2} pts</p>
                </motion.div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Answers comparison */}
      <div className="grid grid-cols-2 gap-2">
        <AnswerBlock
          name={player1Name}
          answer={answer1}
          isYou={playerId === 1}
          highlighted={answersMatch && questionType !== 'C'}
          questionType={questionType}
          delay={0.4}
          emoji="👩"
          answerTime={answerTime1}
          speedBonus={speedBonus1}
          question={question}
          player1Name={player1Name}
          player2Name={player2Name}
        />
        <AnswerBlock
          name={player2Name}
          answer={answer2}
          isYou={playerId === 2}
          highlighted={answersMatch && questionType !== 'C'}
          questionType={questionType}
          delay={0.5}
          emoji="👨"
          answerTime={answerTime2}
          speedBonus={speedBonus2}
          question={question}
          player1Name={player1Name}
          player2Name={player2Name}
        />
      </div>

      {/* Scale visualization for type D */}
      {questionType === 'D' && answer1 && answer2 && (
        <ScaleComparison
          value1={parseInt(answer1, 10)}
          value2={parseInt(answer2, 10)}
          player1Name={player1Name}
          player2Name={player2Name}
        />
      )}

      {/* Fake quote */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5 }}
        className="bg-white/5 rounded-lg p-3 text-center"
      >
        <p className="text-white/70 text-sm italic">
          "{fakeQuote.quote}"
        </p>
        <p className="text-white/50 text-xs mt-1">
          — {fakeQuote.author} (probablement)
        </p>
      </motion.div>

      {/* Next question indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="text-center"
      >
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-white/60 font-semibold text-sm"
        >
          Question suivante dans un instant...
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

interface AnswerBlockProps {
  name: string;
  answer: string | null;
  isYou: boolean;
  highlighted: boolean;
  questionType: string;
  delay: number;
  emoji: string;
  answerTime: number | null;
  speedBonus: number;
  question?: Question;
  player1Name?: string;
  player2Name?: string;
}

function AnswerBlock({
  name,
  answer,
  isYou,
  highlighted,
  questionType,
  delay,
  emoji,
  answerTime,
  speedBonus,
  question,
  player1Name,
  player2Name
}: AnswerBlockProps) {
  // Convert answer codes to display text
  const getDisplayAnswer = () => {
    if (!answer) return null;

    // Special answers
    if (answer === 'joker') return '🃏 Joker';
    if (answer === 'dontknow') return '🤷 Je ne sais pas';

    // Type E: Convert 'A' or 'B' to actual option text
    if (questionType === 'E' && question) {
      if (answer === 'A') return question.option_a || 'Option A';
      if (answer === 'B') return question.option_b || 'Option B';
    }

    // Type F: Convert 'player1' or 'player2' to player name
    if (questionType === 'F') {
      if (answer === 'player1') return player1Name || 'Joueur 1';
      if (answer === 'player2') return player2Name || 'Joueur 2';
      if (answer === 'both') return '👫 Nous deux';
    }

    // Type G: Keep vrai/faux as is but capitalize
    if (questionType === 'G') {
      return answer.charAt(0).toUpperCase() + answer.slice(1);
    }

    return answer;
  };

  const displayAnswer = getDisplayAnswer();

  return (
    <motion.div
      initial={{ x: isYou ? -50 : 50, opacity: 0, scale: 0.8 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 15, stiffness: 100 }}
      className={`
        bg-white rounded-lg p-2 shadow-lg relative overflow-hidden
        ${highlighted ? 'ring-2 ring-[#26890c]' : ''}
      `}
    >
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0 opacity-10"
        style={{
          background: highlighted
            ? 'linear-gradient(135deg, #26890c 0%, #4ade80 100%)'
            : 'linear-gradient(135deg, #46178f 0%, #7c3aed 100%)'
        }}
        animate={highlighted ? {
          opacity: [0.1, 0.2, 0.1]
        } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      />

      {/* Speed indicator */}
      {speedBonus > 0 && answerTime && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.3, type: 'spring' }}
          className="absolute top-1 left-1 bg-yellow-400 rounded-full px-1.5 py-0.5 flex items-center gap-0.5"
        >
          <span className="text-[10px]">⚡</span>
          <span className="text-[10px] font-bold text-yellow-900">{answerTime.toFixed(1)}s</span>
        </motion.div>
      )}

      {/* Checkmark for highlighted */}
      {highlighted && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.2, type: 'spring', stiffness: 200 }}
          className="absolute top-1 right-1 w-6 h-6 bg-[#26890c] rounded-full flex items-center justify-center"
        >
          <motion.span
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
            className="text-white text-sm"
          >
            ✓
          </motion.span>
        </motion.div>
      )}

      {/* Player info */}
      <div className="flex items-center gap-1.5 mb-1.5 relative z-10">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.1, type: 'spring' }}
          className="w-6 h-6 rounded-full bg-gradient-to-br from-[#46178f] to-[#7c3aed] flex items-center justify-center text-sm shadow"
        >
          {emoji}
        </motion.div>
        <div className="flex items-center gap-1">
          <p className="font-bold text-gray-900 text-xs">
            {name}
          </p>
          {isYou && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: delay + 0.2 }}
              className="inline-block text-[10px] bg-[#46178f] text-white px-1.5 py-0.5 rounded-full font-bold"
            >
              Toi
            </motion.span>
          )}
        </div>
      </div>

      {/* Answer with dramatic reveal */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: delay + 0.2, type: 'spring', stiffness: 150 }}
        className={`
          rounded-md p-3 text-center relative overflow-hidden
          ${displayAnswer ? 'bg-gradient-to-br from-[#46178f]/10 to-[#7c3aed]/10' : 'bg-gray-100'}
        `}
      >
        {/* Shine effect on answer */}
        {displayAnswer && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ delay: delay + 0.4, duration: 0.6 }}
          />
        )}
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + 0.3 }}
          className={`
            font-bold relative z-10 break-words
            ${questionType === 'D' ? 'text-4xl text-[#46178f]' : 'text-base sm:text-lg text-gray-900'}
            ${questionType === 'C' ? 'text-sm text-gray-800 whitespace-pre-wrap' : ''}
            ${!displayAnswer ? 'text-gray-400 italic text-sm' : ''}
          `}
        >
          {displayAnswer || 'Pas de réponse'}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

interface ScaleComparisonProps {
  value1: number;
  value2: number;
  player1Name: string;
  player2Name: string;
}

function ScaleComparison({
  value1,
  value2,
  player1Name,
  player2Name
}: ScaleComparisonProps) {
  const diff = Math.abs(value1 - value2);
  const getEmoji = () => {
    if (diff === 0) return '🎯';
    if (diff <= 2) return '👍';
    return '🤔';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-white rounded-lg p-3 shadow-md"
    >
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <span className="text-lg">{getEmoji()}</span>
        <span className="text-gray-900 font-bold text-sm">
          Écart de {diff} pt{diff !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Visual scale */}
      <div className="relative h-8 bg-gradient-to-r from-[#e21b3c] via-[#d89e00] to-[#26890c] rounded-full p-0.5">
        <div className="absolute inset-0.5 bg-white/90 rounded-full" />

        {/* Player 1 marker */}
        <motion.div
          initial={{ left: '5%', scale: 0 }}
          animate={{ left: `${(value1 - 0.5) * 10}%`, scale: 1 }}
          transition={{ delay: 0.6, type: 'spring', damping: 12 }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 bg-[#e21b3c] rounded-full flex items-center justify-center text-white text-sm font-black shadow z-10"
        >
          {value1}
        </motion.div>

        {/* Player 2 marker */}
        <motion.div
          initial={{ left: '5%', scale: 0 }}
          animate={{ left: `${(value2 - 0.5) * 10}%`, scale: 1 }}
          transition={{ delay: 0.7, type: 'spring', damping: 12 }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 bg-[#1368ce] rounded-full flex items-center justify-center text-white text-sm font-black shadow z-10"
        >
          {value2}
        </motion.div>
      </div>

      {/* Legend */}
      <div className="flex justify-between mt-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-[#e21b3c] rounded-full" />
          <span className="text-gray-700 font-semibold">{player1Name}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-[#1368ce] rounded-full" />
          <span className="text-gray-700 font-semibold">{player2Name}</span>
        </div>
      </div>
    </motion.div>
  );
}
