import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { Question, GameRevealData } from '../../../shared/types';
import Confetti from './Confetti';

interface RevealCardProps {
  question: Question;
  revealData: GameRevealData;
  player1Name: string;
  player2Name: string;
  playerId: 1 | 2;
}

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

export default function RevealCard({
  revealData,
  player1Name,
  player2Name,
  playerId
}: RevealCardProps) {
  const { answer1, answer2, correct, points1, points2, questionType } = revealData;
  const [showFlash, setShowFlash] = useState(false);
  const [countedPoints, setCountedPoints] = useState(0);

  const myPoints = playerId === 1 ? points1 : points2;
  const showPoints = questionType !== 'C';
  const answersMatch = answer1 === answer2;

  // Lightning flash on reveal
  useEffect(() => {
    if (showPoints) {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 200);
    }
  }, [showPoints]);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 relative"
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

      {/* Flying emojis for correct answers */}
      {correct && showPoints && (
        <>
          <Confetti count={50} />
          <FlyingEmojis emojis={['💖', '✨', '🌟', '💕', '🎊', '💫']} count={12} />
        </>
      )}

      {/* Wrong answer shake effect - applies to container */}
      <motion.div
        animate={!correct && showPoints ? {
          x: [0, -15, 15, -10, 10, -5, 5, 0],
          transition: { duration: 0.5 }
        } : {}}
      >
        {/* Result banner */}
        <motion.div
          initial={{ scale: 0, rotate: -180, y: -100 }}
          animate={{ scale: 1, rotate: 0, y: 0 }}
          transition={{ type: 'spring', damping: 12, stiffness: 100 }}
          className={`
            rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden
            ${correct && showPoints ? 'bg-gradient-to-br from-[#26890c] to-[#1a5e08] glow-green' : ''}
            ${!correct && showPoints ? 'bg-gradient-to-br from-[#e21b3c] to-[#9c1229] glow-red' : ''}
            ${!showPoints ? 'bg-gradient-to-br from-[#9c27b0] to-[#6a1b7a]' : ''}
          `}
        >
          {/* Animated background shimmer */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-200%', '200%'] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
          />

          {showPoints && (
            <div className="relative z-10">
              {/* Main emoji with dramatic entrance */}
              <motion.div
                initial={{ scale: 0, rotate: -720 }}
                animate={{
                  scale: [0, 1.5, 1],
                  rotate: [0, 360, 0]
                }}
                transition={{
                  duration: 0.8,
                  times: [0, 0.6, 1],
                  type: 'spring',
                  damping: 10
                }}
                className="text-8xl mb-4"
              >
                <motion.span
                  animate={correct ? {
                    scale: [1, 1.2, 1],
                    rotate: [0, 10, -10, 0]
                  } : {}}
                  transition={{ duration: 0.5, repeat: correct ? Infinity : 0, repeatDelay: 1 }}
                >
                  {correct ? '🎉' : '💔'}
                </motion.span>
              </motion.div>

              {/* Title with typing effect */}
              <motion.h2
                initial={{ y: 50, opacity: 0, scale: 0.5 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: 'spring', damping: 15 }}
                className="text-4xl font-black text-white mb-4 text-shadow-strong"
              >
                {answersMatch ? 'Vous pensez pareil !' : 'Pas cette fois...'}
              </motion.h2>

              {/* Points counter with dramatic animation */}
              {myPoints > 0 && (
                <motion.div
                  initial={{ scale: 0, y: 50 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
                  className="inline-block relative"
                >
                  <motion.div
                    className="bg-white/20 backdrop-blur rounded-full px-8 py-3 relative overflow-hidden"
                    animate={{
                      boxShadow: [
                        '0 0 0 0 rgba(255,255,255,0.4)',
                        '0 0 0 20px rgba(255,255,255,0)',
                      ]
                    }}
                    transition={{ duration: 1, repeat: 2 }}
                  >
                    <motion.span
                      className="text-3xl font-black text-white"
                      key={countedPoints}
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.1 }}
                    >
                      +{countedPoints} points
                    </motion.span>
                  </motion.div>

                  {/* Sparkle effects around points */}
                  {[...Array(4)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute text-2xl"
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{
                        opacity: [0, 1, 0],
                        scale: [0, 1, 0],
                        x: [0, (i % 2 ? 1 : -1) * 40],
                        y: [0, (i < 2 ? -1 : 1) * 30]
                      }}
                      transition={{ delay: 0.8 + i * 0.1, duration: 0.6 }}
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
            </div>
          )}

          {!showPoints && (
            <div className="relative z-10">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 10 }}
                className="text-8xl mb-4"
              >
                💬
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-3xl font-black text-white"
              >
                Comparez vos reponses !
              </motion.h2>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Answers comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AnswerBlock
          name={player1Name}
          answer={answer1}
          isYou={playerId === 1}
          highlighted={answersMatch && showPoints}
          questionType={questionType}
          delay={0.4}
          emoji="👩"
        />
        <AnswerBlock
          name={player2Name}
          answer={answer2}
          isYou={playerId === 2}
          highlighted={answersMatch && showPoints}
          questionType={questionType}
          delay={0.5}
          emoji="👨"
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

      {/* Next question indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="text-center"
      >
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-white/60 font-semibold"
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
}

function AnswerBlock({
  name,
  answer,
  isYou,
  highlighted,
  questionType,
  delay,
  emoji
}: AnswerBlockProps) {
  return (
    <motion.div
      initial={{ x: isYou ? -100 : 100, opacity: 0, scale: 0.5, rotate: isYou ? -15 : 15 }}
      animate={{ x: 0, opacity: 1, scale: 1, rotate: 0 }}
      transition={{ delay, type: 'spring', damping: 12, stiffness: 100 }}
      className={`
        bg-white rounded-xl p-5 shadow-2xl relative overflow-hidden
        ${highlighted ? 'ring-4 ring-[#26890c] ring-offset-2' : ''}
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

      {/* Checkmark for highlighted */}
      {highlighted && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: delay + 0.3, type: 'spring', stiffness: 200 }}
          className="absolute top-2 right-2 w-8 h-8 bg-[#26890c] rounded-full flex items-center justify-center"
        >
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
            className="text-white text-lg"
          >
            ✓
          </motion.span>
        </motion.div>
      )}

      {/* Player info */}
      <div className="flex items-center gap-3 mb-3 relative z-10">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.1, type: 'spring' }}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-[#46178f] to-[#7c3aed] flex items-center justify-center text-2xl shadow-lg"
        >
          {emoji}
        </motion.div>
        <div>
          <p className="font-bold text-gray-900">
            {name}
          </p>
          {isYou && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: delay + 0.2 }}
              className="inline-block text-xs bg-[#46178f] text-white px-3 py-0.5 rounded-full font-bold"
            >
              Toi
            </motion.span>
          )}
        </div>
      </div>

      {/* Answer with dramatic reveal */}
      <motion.div
        initial={{ scale: 0, rotateX: 90 }}
        animate={{ scale: 1, rotateX: 0 }}
        transition={{ delay: delay + 0.2, type: 'spring', stiffness: 150 }}
        className={`
          rounded-lg p-4 text-center relative overflow-hidden
          ${answer ? 'bg-gradient-to-br from-[#46178f]/10 to-[#7c3aed]/10' : 'bg-gray-100'}
        `}
      >
        {/* Shine effect on answer */}
        {answer && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ delay: delay + 0.4, duration: 0.8 }}
          />
        )}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + 0.3 }}
          className={`
            font-bold relative z-10
            ${questionType === 'D' ? 'text-5xl text-[#46178f]' : 'text-xl text-gray-900'}
            ${!answer ? 'text-gray-400 italic' : ''}
          `}
        >
          {answer || 'Pas de reponse'}
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="bg-white rounded-xl p-6 shadow-lg"
    >
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-2xl">{getEmoji()}</span>
        <span className="text-gray-900 font-bold">
          Ecart de {diff} point{diff !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Visual scale */}
      <div className="relative h-12 bg-gradient-to-r from-[#e21b3c] via-[#d89e00] to-[#26890c] rounded-full p-1">
        <div className="absolute inset-1 bg-white/90 rounded-full" />

        {/* Markers */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <div
            key={n}
            className="absolute top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold"
            style={{ left: `${(n - 0.5) * 10}%`, transform: 'translateX(-50%) translateY(-50%)' }}
          >
            {n}
          </div>
        ))}

        {/* Player 1 marker */}
        <motion.div
          initial={{ left: '5%', scale: 0 }}
          animate={{ left: `${(value1 - 0.5) * 10}%`, scale: 1 }}
          transition={{ delay: 0.7, type: 'spring', damping: 12 }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 bg-[#e21b3c] rounded-full flex items-center justify-center text-white font-black shadow-lg z-10"
        >
          {value1}
        </motion.div>

        {/* Player 2 marker */}
        <motion.div
          initial={{ left: '5%', scale: 0 }}
          animate={{ left: `${(value2 - 0.5) * 10}%`, scale: 1 }}
          transition={{ delay: 0.8, type: 'spring', damping: 12 }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 bg-[#1368ce] rounded-full flex items-center justify-center text-white font-black shadow-lg z-10"
        >
          {value2}
        </motion.div>
      </div>

      {/* Legend */}
      <div className="flex justify-between mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#e21b3c] rounded-full" />
          <span className="text-gray-700 font-semibold">{player1Name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#1368ce] rounded-full" />
          <span className="text-gray-700 font-semibold">{player2Name}</span>
        </div>
      </div>
    </motion.div>
  );
}
