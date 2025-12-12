import { motion } from 'framer-motion';
import type { Question, GameRevealData } from '../../../shared/types';
import Confetti from './Confetti';

interface RevealCardProps {
  question: Question;
  revealData: GameRevealData;
  player1Name: string;
  player2Name: string;
  playerId: 1 | 2;
}

export default function RevealCard({
  question,
  revealData,
  player1Name,
  player2Name,
  playerId
}: RevealCardProps) {
  const { answer1, answer2, correct, points1, points2, questionType } = revealData;

  const myPoints = playerId === 1 ? points1 : points2;
  const showPoints = questionType !== 'C';
  const answersMatch = answer1 === answer2;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {correct && showPoints && <Confetti count={30} />}

      {/* Result banner */}
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', damping: 12 }}
        className={`
          rounded-2xl p-8 text-center shadow-2xl
          ${correct && showPoints ? 'bg-[#26890c] glow-green' : ''}
          ${!correct && showPoints ? 'bg-[#e21b3c] glow-red' : ''}
          ${!showPoints ? 'bg-[#9c27b0]' : ''}
        `}
      >
        {showPoints && (
          <>
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', delay: 0.2, damping: 10 }}
              className="text-7xl mb-4"
            >
              {correct ? '🎉' : '💔'}
            </motion.div>
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-3xl font-black text-white mb-2"
            >
              {answersMatch ? 'Vous pensez pareil !' : 'Pas cette fois...'}
            </motion.h2>
            {myPoints > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="inline-block bg-white/20 rounded-full px-6 py-2 mt-2"
              >
                <span className="text-2xl font-black text-white">
                  +{myPoints} points
                </span>
              </motion.div>
            )}
          </>
        )}

        {!showPoints && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring' }}
              className="text-7xl mb-4"
            >
              💬
            </motion.div>
            <h2 className="text-2xl font-black text-white">
              Comparez vos reponses !
            </h2>
          </>
        )}
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
      initial={{ y: 30, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 15 }}
      className={`
        bg-white rounded-xl p-5 shadow-lg relative overflow-hidden
        ${highlighted ? 'ring-4 ring-[#26890c]' : ''}
      `}
    >
      {/* Background decoration */}
      {highlighted && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 text-2xl"
        >
          ✓
        </motion.div>
      )}

      {/* Player info */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-[#46178f]/10 flex items-center justify-center text-xl">
          {emoji}
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm">
            {name}
          </p>
          {isYou && (
            <span className="text-xs bg-[#46178f] text-white px-2 py-0.5 rounded-full">
              Toi
            </span>
          )}
        </div>
      </div>

      {/* Answer */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: delay + 0.15 }}
        className={`
          rounded-lg p-4 text-center
          ${answer ? 'bg-[#46178f]/10' : 'bg-gray-100'}
        `}
      >
        <p className={`
          font-bold
          ${questionType === 'D' ? 'text-4xl text-[#46178f]' : 'text-lg text-gray-900'}
          ${!answer ? 'text-gray-400 italic' : ''}
        `}>
          {answer || 'Pas de reponse'}
        </p>
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
