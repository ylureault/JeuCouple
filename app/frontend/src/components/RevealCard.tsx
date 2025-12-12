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

  const myAnswer = playerId === 1 ? answer1 : answer2;
  const theirAnswer = playerId === 1 ? answer2 : answer1;
  const myPoints = playerId === 1 ? points1 : points2;

  const showPoints = questionType !== 'C';
  const answersMatch = answer1 === answer2;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {correct && showPoints && <Confetti count={20} />}

      {/* Result header */}
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        className={`
          card text-center py-8
          ${correct && showPoints ? 'bg-green-500/20 border-2 border-green-500/50' : ''}
          ${!correct && showPoints ? 'bg-red-500/20 border-2 border-red-500/50' : ''}
          ${!showPoints ? 'bg-purple-500/20 border-2 border-purple-500/50' : ''}
        `}
      >
        {showPoints && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="text-6xl mb-4"
            >
              {correct ? '✓' : '✗'}
            </motion.div>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={`text-2xl font-bold ${
                correct ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {answersMatch ? 'Vous pensez pareil !' : 'Pas cette fois...'}
            </motion.p>
            {myPoints > 0 && (
              <motion.p
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="text-xl text-green-400 mt-2"
              >
                +{myPoints} points
              </motion.p>
            )}
          </>
        )}

        {!showPoints && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-6xl mb-4"
            >
              💬
            </motion.div>
            <p className="text-xl text-purple-300">
              Comparez vos reponses !
            </p>
          </>
        )}
      </motion.div>

      {/* Question reminder */}
      <div className="card opacity-70">
        <p className="text-center text-white/80">{question.text}</p>
      </div>

      {/* Answers comparison */}
      <div className="grid grid-cols-2 gap-4">
        <AnswerBlock
          name={player1Name}
          answer={answer1}
          isYou={playerId === 1}
          highlighted={answersMatch}
          questionType={questionType}
          delay={0.4}
        />
        <AnswerBlock
          name={player2Name}
          answer={answer2}
          isYou={playerId === 2}
          highlighted={answersMatch}
          questionType={questionType}
          delay={0.5}
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
}

function AnswerBlock({
  name,
  answer,
  isYou,
  highlighted,
  questionType,
  delay
}: AnswerBlockProps) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay }}
      className={`
        card text-center
        ${highlighted ? 'border-2 border-green-500/50' : 'border-2 border-white/20'}
      `}
    >
      <p className="text-white/50 text-sm mb-1">
        {name}
        {isYou && (
          <span className="ml-1 text-xs bg-primary/20 text-primary px-1 rounded">
            toi
          </span>
        )}
      </p>
      <motion.p
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: delay + 0.1 }}
        className={`font-bold ${
          questionType === 'D' ? 'text-3xl text-primary' : 'text-lg'
        }`}
      >
        {answer || '(pas de reponse)'}
      </motion.p>
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
      className="card"
    >
      <div className="relative h-8 bg-white/10 rounded-full overflow-hidden">
        {/* Scale markers */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <div
            key={n}
            className="absolute top-0 bottom-0 w-px bg-white/20"
            style={{ left: `${(n - 1) * 11.11}%` }}
          />
        ))}

        {/* Player 1 marker */}
        <motion.div
          initial={{ left: '0%' }}
          animate={{ left: `${(value1 - 1) * 11.11}%` }}
          transition={{ delay: 0.7, type: 'spring' }}
          className="absolute top-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-xs font-bold shadow-lg"
        >
          {value1}
        </motion.div>

        {/* Player 2 marker */}
        <motion.div
          initial={{ left: '0%' }}
          animate={{ left: `${(value2 - 1) * 11.11}%` }}
          transition={{ delay: 0.8, type: 'spring' }}
          className="absolute top-1 w-6 h-6 bg-secondary rounded-full flex items-center justify-center text-xs font-bold shadow-lg"
        >
          {value2}
        </motion.div>
      </div>

      <div className="flex justify-between text-sm mt-2">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-primary rounded-full" />
          {player1Name}
        </span>
        <span className="text-white/50">
          Ecart: {diff} point{diff !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-secondary rounded-full" />
          {player2Name}
        </span>
      </div>
    </motion.div>
  );
}
