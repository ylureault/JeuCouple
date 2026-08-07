import { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import type { Question } from '../../../shared/types';

interface QuestionCardProps {
  question: Question;
  onAnswer: (answer: string) => void;
  disabled: boolean;
  selectedAnswer: string | null;
  player1Name?: string;
  player2Name?: string;
  playerId?: 1 | 2;
}

// Quatuor de reponses. Les formes geometriques et le rouge/bleu/jaune/vert
// d'origine venaient de Kahoot et donnaient un rendu de jeu televise ;
// on garde un repere visuel distinct par reponse (utile pour se designer une
// reponse a voix haute) mais avec des glyphes et une palette de jeu de couple.
const buttonStyles = [
  { bg: 'btn-answer-red', shape: 'heart' },
  { bg: 'btn-answer-blue', shape: 'moon' },
  { bg: 'btn-answer-yellow', shape: 'spark', textColor: 'text-[#2b1508]' },
  { bg: 'btn-answer-green', shape: 'flame' },
];

const SHAPE_PATHS: Record<string, string> = {
  heart: 'M12 21s-7.5-4.9-9.6-9.2C.7 8.4 2.4 4.6 5.9 4c2-.35 3.9.6 4.9 2.2h2.4c1-1.6 2.9-2.55 4.9-2.2 3.5.6 5.2 4.4 3.5 7.8C19.5 16.1 12 21 12 21z',
  moon: 'M20.7 14.6A8.6 8.6 0 0 1 9.4 3.3a8.7 8.7 0 1 0 11.3 11.3z',
  spark: 'M12 2l2.3 6.4L21 10.7l-6.7 2.3L12 19.4l-2.3-6.4L3 10.7l6.7-2.3L12 2z',
  flame: 'M12 22c3.9 0 6.6-2.4 6.6-6 0-3.9-3.2-6.4-4.3-9.7-.2-.6-1-.7-1.3-.1-.9 1.6-1.6 2.6-2.7 3.9-1.6 1.9-2.9 3.4-2.9 5.9 0 3.6 2.7 6 6.6 6z',
};

function Shape({ type, className = '' }: { type: string; className?: string }) {
  const d = SHAPE_PATHS[type];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
         className={`w-5 h-5 shrink-0 opacity-90 ${className}`}>
      <path d={d} />
    </svg>
  );
}

export default function QuestionCard({
  question,
  onAnswer,
  disabled,
  selectedAnswer,
  player1Name = 'Joueur 1',
  player2Name = 'Joueur 2',
  playerId = 1
}: QuestionCardProps) {
  const [scaleValue, setScaleValue] = useState(5);
  const [freeText, setFreeText] = useState('');

  const renderTypeAB = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {question.options?.map((option, index) => {
        const style = buttonStyles[index % 4];
        const isSelected = selectedAnswer === option;

        return (
          <motion.button
            key={index}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: index * 0.08,
              type: 'spring',
              stiffness: 200,
              damping: 15
            }}
            onClick={() => !disabled && onAnswer(option)}
            disabled={disabled}
            className={`
              ${style.bg} ${style.textColor || 'text-white'}
              ${disabled && !isSelected ? 'btn-answer-disabled' : ''}
              ${isSelected ? 'btn-answer-selected' : ''}
            `}
            whileHover={disabled ? {} : { scale: 1.02, y: -2 }}
            whileTap={disabled ? {} : { scale: 0.98 }}
          >
            <Shape type={style.shape} />
            {/* break-words : sans lui, une option longue etait rognee par
                l'overflow-hidden du bouton au lieu de passer a la ligne */}
            <span className="flex-1 text-left font-bold text-base break-words">
              {option}
            </span>
            {isSelected && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-xl"
              >
                ✓
              </motion.span>
            )}
          </motion.button>
        );
      })}
    </div>
  );

  const renderTypeC = () => {
    const handleSubmit = () => {
      if (freeText.trim()) {
        onAnswer(freeText.trim());
      }
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <div className="bg-white rounded-xl p-1 shadow-lg">
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Écris ta réponse ici..."
            className="w-full h-24 p-3 text-gray-900 text-base font-semibold resize-none rounded-lg
                       focus:outline-none placeholder-gray-400"
            disabled={disabled}
            maxLength={500}
          />
        </div>
        <motion.button
          onClick={handleSubmit}
          disabled={disabled || !freeText.trim()}
          className="btn-answer bg-[#26890c] w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          whileHover={disabled || !freeText.trim() ? {} : { scale: 1.02 }}
          whileTap={disabled || !freeText.trim() ? {} : { scale: 0.98 }}
        >
          <span className="text-lg">✓</span>
          <span className="text-sm">Valider ma réponse</span>
        </motion.button>
      </motion.div>
    );
  };

  const renderTypeD = () => {
    const handleSubmit = () => {
      onAnswer(scaleValue.toString());
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Scale value display */}
        <div className="text-center">
          <motion.div
            key={scaleValue}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-block"
          >
            <span className="text-6xl font-black text-white text-shadow-strong">
              {scaleValue}
            </span>
          </motion.div>
          <p className="text-white/60 text-sm">sur 10</p>
        </div>

        {/* Slider */}
        <div className="px-2">
          <div className="relative">
            <input
              type="range"
              min="1"
              max="10"
              value={scaleValue}
              onChange={(e) => setScaleValue(parseInt(e.target.value))}
              disabled={disabled}
              className="w-full h-3 rounded-full cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-white/70 font-bold mt-2 text-sm">
            <span className="flex flex-col items-center">
              <span className="text-xl">😢</span>
              <span>1</span>
            </span>
            <span className="flex flex-col items-center">
              <span className="text-xl">😐</span>
              <span>5</span>
            </span>
            <span className="flex flex-col items-center">
              <span className="text-xl">😍</span>
              <span>10</span>
            </span>
          </div>
        </div>

        {/* Submit button */}
        <motion.button
          onClick={handleSubmit}
          disabled={disabled}
          className="btn-answer bg-[#26890c] w-full py-3 disabled:opacity-50"
          whileHover={disabled ? {} : { scale: 1.02 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <span className="text-lg">✓</span>
          <span className="text-sm">Valider</span>
        </motion.button>
      </motion.div>
    );
  };

  // Type E: "Tu es plutot..." - Binary choice between two options
  const renderTypeE = () => {
    const optionA = question.option_a || 'Option A';
    const optionB = question.option_b || 'Option B';

    return (
      <div className="grid grid-cols-2 gap-2">
        {/* Option A */}
        <motion.button
          initial={{ opacity: 0, x: -30, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          onClick={() => !disabled && onAnswer('A')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-xl p-4 min-h-[100px]
            bg-gradient-to-br from-[#9b59b6] to-[#8e44ad]
            ${disabled && selectedAnswer !== 'A' ? 'opacity-50' : ''}
            ${selectedAnswer === 'A' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="absolute top-1 left-1 text-xl">⬅️</div>
          <div className="flex flex-col items-center justify-center h-full">
            <span className="text-white font-extrabold text-lg text-center leading-tight">
              {optionA}
            </span>
          </div>
          {selectedAnswer === 'A' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute bottom-1 right-1 text-xl"
            >
              ✓
            </motion.div>
          )}
        </motion.button>

        {/* Option B */}
        <motion.button
          initial={{ opacity: 0, x: 30, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          onClick={() => !disabled && onAnswer('B')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-xl p-4 min-h-[100px]
            bg-gradient-to-br from-[#e91e63] to-[#c2185b]
            ${disabled && selectedAnswer !== 'B' ? 'opacity-50' : ''}
            ${selectedAnswer === 'B' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="absolute top-1 right-1 text-xl">➡️</div>
          <div className="flex flex-col items-center justify-center h-full">
            <span className="text-white font-extrabold text-lg text-center leading-tight">
              {optionB}
            </span>
          </div>
          {selectedAnswer === 'B' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute bottom-1 left-1 text-xl"
            >
              ✓
            </motion.div>
          )}
        </motion.button>
      </div>
    );
  };

  // Type F: "Qui de nous deux..." - Choose which player
  const renderTypeF = () => {
    const myName = playerId === 1 ? player1Name : player2Name;
    const theirName = playerId === 1 ? player2Name : player1Name;

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {/* Moi */}
          <motion.button
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            onClick={() => !disabled && onAnswer(playerId === 1 ? 'player1' : 'player2')}
            disabled={disabled}
            className={`
              relative overflow-hidden rounded-xl p-3 min-h-[90px]
              bg-gradient-to-br from-[#00bcd4] to-[#0097a7]
              ${disabled && selectedAnswer !== (playerId === 1 ? 'player1' : 'player2') ? 'opacity-50' : ''}
              ${selectedAnswer === (playerId === 1 ? 'player1' : 'player2') ? 'ring-2 ring-white scale-102' : ''}
              shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
              active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
              transition-all duration-100
            `}
            whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
            whileTap={disabled ? {} : { scale: 0.98 }}
          >
            <div className="flex flex-col items-center justify-center h-full gap-1">
              <motion.span
                className="text-3xl"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                🙋
              </motion.span>
              <span className="text-white font-extrabold text-base">MOI</span>
              <span className="text-white/70 text-xs">({myName})</span>
            </div>
            {selectedAnswer === (playerId === 1 ? 'player1' : 'player2') && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-1 right-1 text-lg"
              >
                ✓
              </motion.div>
            )}
          </motion.button>

          {/* Lui/Elle */}
          <motion.button
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
            onClick={() => !disabled && onAnswer(playerId === 1 ? 'player2' : 'player1')}
            disabled={disabled}
            className={`
              relative overflow-hidden rounded-xl p-3 min-h-[90px]
              bg-gradient-to-br from-[#ff5722] to-[#e64a19]
              ${disabled && selectedAnswer !== (playerId === 1 ? 'player2' : 'player1') ? 'opacity-50' : ''}
              ${selectedAnswer === (playerId === 1 ? 'player2' : 'player1') ? 'ring-2 ring-white scale-102' : ''}
              shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
              active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
              transition-all duration-100
            `}
            whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
            whileTap={disabled ? {} : { scale: 0.98 }}
          >
            <div className="flex flex-col items-center justify-center h-full gap-1">
              <motion.span
                className="text-3xl"
                animate={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                💑
              </motion.span>
              <span className="text-white font-extrabold text-base">LUI/ELLE</span>
              <span className="text-white/70 text-xs">({theirName})</span>
            </div>
            {selectedAnswer === (playerId === 1 ? 'player2' : 'player1') && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-1 left-1 text-lg"
              >
                ✓
              </motion.div>
            )}
          </motion.button>
        </div>

        {/* Nous deux */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          onClick={() => !disabled && onAnswer('both')}
          disabled={disabled}
          className={`
            w-full relative overflow-hidden rounded-lg p-3
            bg-gradient-to-br from-[#9c27b0] to-[#7b1fa2]
            ${disabled && selectedAnswer !== 'both' ? 'opacity-50' : ''}
            ${selectedAnswer === 'both' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_3px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[2px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.02, y: -1 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">👫</span>
            <span className="text-white font-bold text-base">Nous deux</span>
          </div>
          {selectedAnswer === 'both' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1 right-1 text-lg"
            >
              ✓
            </motion.div>
          )}
        </motion.button>

        {/* Je ne sais pas */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
          onClick={() => !disabled && onAnswer('dontknow')}
          disabled={disabled}
          className={`
            w-full relative overflow-hidden rounded-lg p-3
            bg-gradient-to-br from-gray-500 to-gray-600
            ${disabled && selectedAnswer !== 'dontknow' ? 'opacity-50' : ''}
            ${selectedAnswer === 'dontknow' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_3px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[2px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.02, y: -1 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">🤷</span>
            <span className="text-white font-bold text-base">Je ne sais pas</span>
          </div>
          {selectedAnswer === 'dontknow' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1 right-1 text-lg"
            >
              ✓
            </motion.div>
          )}
        </motion.button>
      </div>
    );
  };

  // Type G: "Vrai ou Faux" - True or false about a specific player
  const renderTypeG = () => {
    return (
      <div className="grid grid-cols-2 gap-2">
        {/* Vrai */}
        <motion.button
          initial={{ opacity: 0, x: -30, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          onClick={() => !disabled && onAnswer('vrai')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-xl p-4 min-h-[100px]
            bg-gradient-to-br from-[#26890c] to-[#1a6b08]
            ${disabled && selectedAnswer !== 'vrai' ? 'opacity-50' : ''}
            ${selectedAnswer === 'vrai' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <motion.span
              className="text-3xl"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              ✅
            </motion.span>
            <span className="text-white font-extrabold text-xl">
              VRAI
            </span>
          </div>
          {selectedAnswer === 'vrai' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1 right-1 text-xl"
            >
              ✓
            </motion.div>
          )}
        </motion.button>

        {/* Faux */}
        <motion.button
          initial={{ opacity: 0, x: 30, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          onClick={() => !disabled && onAnswer('faux')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-xl p-4 min-h-[100px]
            bg-gradient-to-br from-[#e21b3c] to-[#b01530]
            ${disabled && selectedAnswer !== 'faux' ? 'opacity-50' : ''}
            ${selectedAnswer === 'faux' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <motion.span
              className="text-3xl"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
            >
              ❌
            </motion.span>
            <span className="text-white font-extrabold text-xl">
              FAUX
            </span>
          </div>
          {selectedAnswer === 'faux' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1 left-1 text-xl"
            >
              ✓
            </motion.div>
          )}
        </motion.button>
      </div>
    );
  };

  // Type H: Culture Générale QCM - Multiple choice with one correct answer
  const renderTypeH = () => {
    const qcmStyles = [
      { bg: 'bg-gradient-to-br from-[#673ab7] to-[#512da8]', letter: 'A' },
      { bg: 'bg-gradient-to-br from-[#3f51b5] to-[#303f9f]', letter: 'B' },
      { bg: 'bg-gradient-to-br from-[#009688] to-[#00796b]', letter: 'C' },
      { bg: 'bg-gradient-to-br from-[#ff9800] to-[#f57c00]', letter: 'D' },
    ];

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {question.options?.map((option, index) => {
          const style = qcmStyles[index % 4];
          const isSelected = selectedAnswer === option;

          return (
            <motion.button
              key={index}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: index * 0.08,
                type: 'spring',
                stiffness: 200,
                damping: 15
              }}
              onClick={() => !disabled && onAnswer(option)}
              disabled={disabled}
              className={`
                relative overflow-hidden rounded-lg p-3 min-h-[56px]
                ${style.bg} text-white
                ${disabled && !isSelected ? 'opacity-50' : ''}
                ${isSelected ? 'ring-2 ring-white scale-102' : ''}
                shadow-[0_3px_0_0_rgba(0,0,0,0.3)]
                active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[2px]
                transition-all duration-100
              `}
              whileHover={disabled ? {} : { scale: 1.02, y: -2 }}
              whileTap={disabled ? {} : { scale: 0.98 }}
            >
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-black text-base flex-shrink-0">
                  {style.letter}
                </span>
                <span className="flex-1 text-left font-bold text-sm leading-tight">
                  {option}
                </span>
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-lg"
                  >
                    ✓
                  </motion.span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    );
  };

  // Type I: Image-based choice with large emojis - "Tu es plutot crac crac..."
  const renderTypeI = () => {
    const optionA = question.option_a || 'Option A';
    const optionB = question.option_b || 'Option B';
    const emojiA = question.emoji_a || '🏖️';
    const emojiB = question.emoji_b || '⛰️';

    return (
      <div className="grid grid-cols-2 gap-2">
        {/* Option A with large emoji */}
        <motion.button
          initial={{ opacity: 0, x: -30, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          onClick={() => !disabled && onAnswer('A')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-xl p-3 min-h-[120px]
            bg-gradient-to-br from-[#ff6b6b] via-[#ee5a5a] to-[#ff4757]
            ${disabled && selectedAnswer !== 'A' ? 'opacity-50' : ''}
            ${selectedAnswer === 'A' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="relative flex flex-col items-center justify-center h-full gap-1">
            <motion.span
              className="text-4xl md:text-5xl filter drop-shadow-lg"
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
            >
              {emojiA}
            </motion.span>
            <span className="text-white font-extrabold text-base text-center leading-tight text-shadow-strong px-1">
              {optionA}
            </span>
          </div>
          {selectedAnswer === 'A' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1 right-1 bg-white rounded-full p-0.5"
            >
              <span className="text-green-500 text-lg font-bold">✓</span>
            </motion.div>
          )}
        </motion.button>

        {/* Option B with large emoji */}
        <motion.button
          initial={{ opacity: 0, x: 30, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          onClick={() => !disabled && onAnswer('B')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-xl p-3 min-h-[120px]
            bg-gradient-to-br from-[#5f27cd] via-[#6c3ad1] to-[#341f97]
            ${disabled && selectedAnswer !== 'B' ? 'opacity-50' : ''}
            ${selectedAnswer === 'B' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="relative flex flex-col items-center justify-center h-full gap-1">
            <motion.span
              className="text-4xl md:text-5xl filter drop-shadow-lg"
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, -5, 5, 0]
              }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, delay: 0.5 }}
            >
              {emojiB}
            </motion.span>
            <span className="text-white font-extrabold text-base text-center leading-tight text-shadow-strong px-1">
              {optionB}
            </span>
          </div>
          {selectedAnswer === 'B' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1 left-1 bg-white rounded-full p-0.5"
            >
              <span className="text-green-500 text-lg font-bold">✓</span>
            </motion.div>
          )}
        </motion.button>
      </div>
    );
  };

  // Type L: Avant/Après - binary choice
  const renderTypeL = () => {
    const optionA = question.option_a || 'Avant';
    const optionB = question.option_b || 'Après';

    return (
      <div className="grid grid-cols-2 gap-2">
        <motion.button
          initial={{ opacity: 0, x: -30, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          onClick={() => !disabled && onAnswer('A')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-xl p-4 min-h-[100px]
            bg-gradient-to-br from-[#1368ce] to-[#0d47a1]
            ${disabled && selectedAnswer !== 'A' ? 'opacity-50' : ''}
            ${selectedAnswer === 'A' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <span className="text-3xl">⬅️</span>
            <span className="text-white font-extrabold text-lg text-center leading-tight">{optionA}</span>
          </div>
          {selectedAnswer === 'A' && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute bottom-1 right-1 text-xl">✓</motion.div>
          )}
        </motion.button>
        <motion.button
          initial={{ opacity: 0, x: 30, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          onClick={() => !disabled && onAnswer('B')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-xl p-4 min-h-[100px]
            bg-gradient-to-br from-[#e91e63] to-[#c2185b]
            ${disabled && selectedAnswer !== 'B' ? 'opacity-50' : ''}
            ${selectedAnswer === 'B' ? 'ring-2 ring-white scale-102' : ''}
            shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <span className="text-3xl">➡️</span>
            <span className="text-white font-extrabold text-lg text-center leading-tight">{optionB}</span>
          </div>
          {selectedAnswer === 'B' && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute bottom-1 left-1 text-xl">✓</motion.div>
          )}
        </motion.button>
      </div>
    );
  };

  // Type N: Plus ou Moins
  const renderTypeN = () => (
    <div className="grid grid-cols-2 gap-2">
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        onClick={() => !disabled && onAnswer('plus')}
        disabled={disabled}
        className={`
          relative overflow-hidden rounded-xl p-4 min-h-[100px]
          bg-gradient-to-br from-[#26890c] to-[#1a6b08]
          ${disabled && selectedAnswer !== 'plus' ? 'opacity-50' : ''}
          ${selectedAnswer === 'plus' ? 'ring-2 ring-white scale-102' : ''}
          shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
          active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
          transition-all duration-100
        `}
        whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
      >
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <span className="text-4xl font-black text-white">+</span>
          <span className="text-white font-extrabold text-xl">PLUS</span>
        </div>
        {selectedAnswer === 'plus' && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-1 right-1 text-xl">✓</motion.div>
        )}
      </motion.button>
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
        onClick={() => !disabled && onAnswer('moins')}
        disabled={disabled}
        className={`
          relative overflow-hidden rounded-xl p-4 min-h-[100px]
          bg-gradient-to-br from-[#e21b3c] to-[#b01530]
          ${disabled && selectedAnswer !== 'moins' ? 'opacity-50' : ''}
          ${selectedAnswer === 'moins' ? 'ring-2 ring-white scale-102' : ''}
          shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
          active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
          transition-all duration-100
        `}
        whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
      >
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <span className="text-4xl font-black text-white">-</span>
          <span className="text-white font-extrabold text-xl">MOINS</span>
        </div>
        {selectedAnswer === 'moins' && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-1 left-1 text-xl">✓</motion.div>
        )}
      </motion.button>
    </div>
  );

  // Type S: Hot Take - d'accord ou pas d'accord
  /**
   * Geste de glissement du type S : la carte s'emporte a droite (oui) ou a
   * gauche (non), comme demande pour le mode "Envies express". Les deux
   * boutons restent en dessous : au clavier ou si le geste echoue, on peut
   * toujours repondre.
   */
  const SwipeCard = () => {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-220, 220], [-14, 14]);
    const yesOpacity = useTransform(x, [40, 130], [0, 1]);
    const noOpacity = useTransform(x, [-130, -40], [1, 0]);
    const THRESHOLD = 110;

    return (
      <motion.div
        drag={disabled ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        style={{ x, rotate }}
        onDragEnd={(_, info) => {
          if (disabled) return;
          if (info.offset.x > THRESHOLD) onAnswer('daccord');
          else if (info.offset.x < -THRESHOLD) onAnswer('pasdaccord');
        }}
        className="relative surface rounded-[22px] px-5 py-7 mb-3 text-center cursor-grab
                   active:cursor-grabbing touch-pan-y select-none"
        aria-hidden="true"  /* doublon visuel des boutons, exclu des lecteurs d'ecran */
      >
        {/* Verdict qui se revele pendant le glissement */}
        <motion.span style={{ opacity: yesOpacity }}
          className="absolute top-3 left-4 text-2xl font-black text-[#3fae8f] rotate-[-8deg]">
          OUI 💚
        </motion.span>
        <motion.span style={{ opacity: noOpacity }}
          className="absolute top-3 right-4 text-2xl font-black text-[#e8557f] rotate-[8deg]">
          NON
        </motion.span>

        <span className="text-4xl block mb-2">💫</span>
        <p className="text-white/85 font-bold text-sm">
          Glisse la carte : <span className="text-[#3fae8f]">droite = oui</span>
          {' '}· <span className="text-[#e8557f]">gauche = non</span>
        </p>
      </motion.div>
    );
  };

  const renderTypeS = () => (
    <div>
      <SwipeCard />
      <div className="grid grid-cols-2 gap-2">
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        onClick={() => !disabled && onAnswer('daccord')}
        disabled={disabled}
        className={`
          relative overflow-hidden rounded-xl p-4 min-h-[100px]
          bg-gradient-to-br from-[#26890c] to-[#1a6b08]
          ${disabled && selectedAnswer !== 'daccord' ? 'opacity-50' : ''}
          ${selectedAnswer === 'daccord' ? 'ring-2 ring-white scale-102' : ''}
          shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
          active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
          transition-all duration-100
        `}
        whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
      >
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <span className="text-3xl">👍</span>
          <span className="text-white font-extrabold text-lg">D'accord</span>
        </div>
        {selectedAnswer === 'daccord' && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-1 right-1 text-xl">✓</motion.div>
        )}
      </motion.button>
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
        onClick={() => !disabled && onAnswer('pasdaccord')}
        disabled={disabled}
        className={`
          relative overflow-hidden rounded-xl p-4 min-h-[100px]
          bg-gradient-to-br from-[#e21b3c] to-[#b01530]
          ${disabled && selectedAnswer !== 'pasdaccord' ? 'opacity-50' : ''}
          ${selectedAnswer === 'pasdaccord' ? 'ring-2 ring-white scale-102' : ''}
          shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
          active:shadow-[0_1px_0_0_rgba(0,0,0,0.3)] active:translate-y-[3px]
          transition-all duration-100
        `}
        whileHover={disabled ? {} : { scale: 1.03, y: -2 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
      >
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <span className="text-3xl">👎</span>
          <span className="text-white font-extrabold text-lg">Pas d'accord</span>
        </div>
        {selectedAnswer === 'pasdaccord' && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-1 left-1 text-xl">✓</motion.div>
        )}
      </motion.button>
      </div>
    </div>
  );

  // Joker button - available for all question types
  const renderJoker = () => (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, type: 'spring', stiffness: 150 }}
      onClick={() => !disabled && onAnswer('joker')}
      disabled={disabled}
      className={`
        w-full relative overflow-hidden rounded-lg p-2
        bg-gradient-to-br from-amber-600 to-amber-700 border border-amber-400
        ${disabled && selectedAnswer !== 'joker' ? 'opacity-40' : ''}
        ${selectedAnswer === 'joker' ? 'ring-2 ring-amber-300 scale-105' : ''}
        shadow-[0_2px_0_0_rgba(0,0,0,0.3)]
        active:shadow-none active:translate-y-[2px]
        transition-all duration-100
      `}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
    >
      <div className="flex items-center justify-center gap-2">
        <span className="text-lg">🃏</span>
        <span className="text-white font-bold text-sm">JOKER</span>
        <span className="text-amber-200 text-xs">(-50 pts)</span>
      </div>
      {selectedAnswer === 'joker' && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-1 right-2 text-base"
        >
          ✓
        </motion.div>
      )}
    </motion.button>
  );

  return (
    <div className="space-y-2 w-full max-w-2xl mx-auto">
      {(question.type === 'A' || question.type === 'B') && renderTypeAB()}
      {question.type === 'C' && renderTypeC()}
      {(question.type === 'D' || question.type === 'Q' || question.type === 'K') && renderTypeD()}
      {question.type === 'E' && renderTypeE()}
      {question.type === 'F' && renderTypeF()}
      {question.type === 'G' && renderTypeG()}
      {(question.type === 'H' || question.type === 'J') && renderTypeH()}
      {question.type === 'I' && renderTypeI()}
      {question.type === 'L' && renderTypeL()}
      {(question.type === 'M' || question.type === 'O' || question.type === 'P' || question.type === 'R') && (question.options ? renderTypeAB() : renderTypeC())}
      {question.type === 'N' && renderTypeN()}
      {question.type === 'S' && renderTypeS()}

      {/* Joker button for all types */}
      <div className="pt-1 border-t border-white/20">
        {renderJoker()}
      </div>
    </div>
  );
}
