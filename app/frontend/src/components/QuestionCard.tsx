import { useState } from 'react';
import { motion } from 'framer-motion';
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

const buttonStyles = [
  { bg: 'bg-[#e21b3c]', shape: 'triangle' },
  { bg: 'bg-[#1368ce]', shape: 'diamond' },
  { bg: 'bg-[#d89e00]', shape: 'circle', textColor: 'text-gray-900' },
  { bg: 'bg-[#26890c]', shape: 'square' },
];

function Shape({ type, className = '' }: { type: string; className?: string }) {
  switch (type) {
    case 'triangle':
      return <div className={`shape-triangle ${className}`} />;
    case 'diamond':
      return <div className={`shape-diamond ${className}`} />;
    case 'circle':
      return <div className={`shape-circle ${className}`} />;
    case 'square':
      return <div className={`shape-square ${className}`} />;
    default:
      return null;
  }
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {question.options?.map((option, index) => {
        const style = buttonStyles[index % 4];
        const isSelected = selectedAnswer === option;

        return (
          <motion.button
            key={index}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              delay: index * 0.1,
              type: 'spring',
              stiffness: 200,
              damping: 15
            }}
            onClick={() => !disabled && onAnswer(option)}
            disabled={disabled}
            className={`
              btn-answer ${style.bg} ${style.textColor || 'text-white'}
              ${disabled && !isSelected ? 'btn-answer-disabled' : ''}
              ${isSelected ? 'btn-answer-selected' : ''}
            `}
            whileHover={disabled ? {} : { scale: 1.03, y: -4 }}
            whileTap={disabled ? {} : { scale: 0.97 }}
          >
            <Shape type={style.shape} className={style.textColor ? 'text-gray-900' : 'text-white'} />
            <span className="flex-1 text-left font-bold text-lg">
              {option}
            </span>
            {isSelected && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-2xl"
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="bg-white rounded-xl p-1 shadow-lg">
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Ecris ta reponse ici..."
            className="w-full h-32 p-4 text-gray-900 text-lg font-semibold resize-none rounded-lg
                       focus:outline-none placeholder-gray-400"
            disabled={disabled}
            maxLength={500}
          />
        </div>
        <motion.button
          onClick={handleSubmit}
          disabled={disabled || !freeText.trim()}
          className="btn-answer bg-[#26890c] w-full disabled:opacity-50 disabled:cursor-not-allowed"
          whileHover={disabled || !freeText.trim() ? {} : { scale: 1.02 }}
          whileTap={disabled || !freeText.trim() ? {} : { scale: 0.98 }}
        >
          <span className="text-xl">✓</span>
          <span>Valider ma reponse</span>
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        {/* Scale value display */}
        <div className="text-center">
          <motion.div
            key={scaleValue}
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-block"
          >
            <span className="text-8xl font-black text-white text-shadow-strong">
              {scaleValue}
            </span>
          </motion.div>
          <p className="text-white/60 text-lg mt-2">sur 10</p>
        </div>

        {/* Slider */}
        <div className="px-4">
          <div className="relative">
            <input
              type="range"
              min="1"
              max="10"
              value={scaleValue}
              onChange={(e) => setScaleValue(parseInt(e.target.value))}
              disabled={disabled}
              className="w-full h-4 rounded-full cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-white/70 font-bold mt-4">
            <span className="flex flex-col items-center">
              <span className="text-2xl">😢</span>
              <span>1</span>
            </span>
            <span className="flex flex-col items-center">
              <span className="text-2xl">😐</span>
              <span>5</span>
            </span>
            <span className="flex flex-col items-center">
              <span className="text-2xl">😍</span>
              <span>10</span>
            </span>
          </div>
        </div>

        {/* Submit button */}
        <motion.button
          onClick={handleSubmit}
          disabled={disabled}
          className="btn-answer bg-[#26890c] w-full disabled:opacity-50"
          whileHover={disabled ? {} : { scale: 1.02 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <span className="text-xl">✓</span>
          <span>Valider</span>
        </motion.button>
      </motion.div>
    );
  };

  // Type E: "Tu es plutot..." - Binary choice between two options
  const renderTypeE = () => {
    const optionA = question.option_a || 'Option A';
    const optionB = question.option_b || 'Option B';

    return (
      <div className="grid grid-cols-2 gap-4">
        {/* Option A */}
        <motion.button
          initial={{ opacity: 0, x: -50, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          onClick={() => !disabled && onAnswer('A')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-2xl p-6 min-h-[140px]
            bg-gradient-to-br from-[#9b59b6] to-[#8e44ad]
            ${disabled && selectedAnswer !== 'A' ? 'opacity-50' : ''}
            ${selectedAnswer === 'A' ? 'ring-4 ring-white ring-offset-2 ring-offset-transparent scale-105' : ''}
            shadow-[0_8px_0_0_rgba(0,0,0,0.3)] hover:shadow-[0_6px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[6px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.05, y: -4 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="absolute top-2 left-2 text-3xl">⬅️</div>
          <div className="flex flex-col items-center justify-center h-full">
            <span className="text-white font-extrabold text-xl md:text-2xl text-center leading-tight">
              {optionA}
            </span>
          </div>
          {selectedAnswer === 'A' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute bottom-2 right-2 text-3xl"
            >
              ✓
            </motion.div>
          )}
        </motion.button>

        {/* Option B */}
        <motion.button
          initial={{ opacity: 0, x: 50, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          onClick={() => !disabled && onAnswer('B')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-2xl p-6 min-h-[140px]
            bg-gradient-to-br from-[#e91e63] to-[#c2185b]
            ${disabled && selectedAnswer !== 'B' ? 'opacity-50' : ''}
            ${selectedAnswer === 'B' ? 'ring-4 ring-white ring-offset-2 ring-offset-transparent scale-105' : ''}
            shadow-[0_8px_0_0_rgba(0,0,0,0.3)] hover:shadow-[0_6px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[6px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.05, y: -4 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="absolute top-2 right-2 text-3xl">➡️</div>
          <div className="flex flex-col items-center justify-center h-full">
            <span className="text-white font-extrabold text-xl md:text-2xl text-center leading-tight">
              {optionB}
            </span>
          </div>
          {selectedAnswer === 'B' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute bottom-2 left-2 text-3xl"
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Moi */}
          <motion.button
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            onClick={() => !disabled && onAnswer(playerId === 1 ? 'player1' : 'player2')}
            disabled={disabled}
            className={`
              relative overflow-hidden rounded-2xl p-6 min-h-[140px]
              bg-gradient-to-br from-[#00bcd4] to-[#0097a7]
              ${disabled && selectedAnswer !== (playerId === 1 ? 'player1' : 'player2') ? 'opacity-50' : ''}
              ${selectedAnswer === (playerId === 1 ? 'player1' : 'player2') ? 'ring-4 ring-white ring-offset-2 scale-105' : ''}
              shadow-[0_8px_0_0_rgba(0,0,0,0.3)]
              active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[6px]
              transition-all duration-100
            `}
            whileHover={disabled ? {} : { scale: 1.05, y: -4 }}
            whileTap={disabled ? {} : { scale: 0.98 }}
          >
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <motion.span
                className="text-5xl"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                🙋
              </motion.span>
              <span className="text-white font-extrabold text-lg">MOI</span>
              <span className="text-white/70 text-xs">({myName})</span>
            </div>
            {selectedAnswer === (playerId === 1 ? 'player1' : 'player2') && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 text-2xl"
              >
                ✓
              </motion.div>
            )}
          </motion.button>

          {/* Lui/Elle */}
          <motion.button
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
            onClick={() => !disabled && onAnswer(playerId === 1 ? 'player2' : 'player1')}
            disabled={disabled}
            className={`
              relative overflow-hidden rounded-2xl p-6 min-h-[140px]
              bg-gradient-to-br from-[#ff5722] to-[#e64a19]
              ${disabled && selectedAnswer !== (playerId === 1 ? 'player2' : 'player1') ? 'opacity-50' : ''}
              ${selectedAnswer === (playerId === 1 ? 'player2' : 'player1') ? 'ring-4 ring-white ring-offset-2 scale-105' : ''}
              shadow-[0_8px_0_0_rgba(0,0,0,0.3)]
              active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[6px]
              transition-all duration-100
            `}
            whileHover={disabled ? {} : { scale: 1.05, y: -4 }}
            whileTap={disabled ? {} : { scale: 0.98 }}
          >
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <motion.span
                className="text-5xl"
                animate={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              >
                💑
              </motion.span>
              <span className="text-white font-extrabold text-lg">LUI/ELLE</span>
              <span className="text-white/70 text-xs">({theirName})</span>
            </div>
            {selectedAnswer === (playerId === 1 ? 'player2' : 'player1') && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 left-2 text-2xl"
              >
                ✓
              </motion.div>
            )}
          </motion.button>
        </div>

        {/* Nous deux */}
        <motion.button
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          onClick={() => !disabled && onAnswer('both')}
          disabled={disabled}
          className={`
            w-full relative overflow-hidden rounded-xl p-4
            bg-gradient-to-br from-[#9c27b0] to-[#7b1fa2]
            ${disabled && selectedAnswer !== 'both' ? 'opacity-50' : ''}
            ${selectedAnswer === 'both' ? 'ring-4 ring-white ring-offset-2 scale-105' : ''}
            shadow-[0_6px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[4px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.02, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl">👫</span>
            <span className="text-white font-bold text-lg">Nous deux</span>
          </div>
          {selectedAnswer === 'both' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 right-2 text-2xl"
            >
              ✓
            </motion.div>
          )}
        </motion.button>

        {/* Je ne sais pas */}
        <motion.button
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
          onClick={() => !disabled && onAnswer('dontknow')}
          disabled={disabled}
          className={`
            w-full relative overflow-hidden rounded-xl p-4
            bg-gradient-to-br from-gray-500 to-gray-600
            ${disabled && selectedAnswer !== 'dontknow' ? 'opacity-50' : ''}
            ${selectedAnswer === 'dontknow' ? 'ring-4 ring-white ring-offset-2 scale-105' : ''}
            shadow-[0_6px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[4px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.02, y: -2 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl">🤷</span>
            <span className="text-white font-bold text-lg">Je ne sais pas</span>
          </div>
          {selectedAnswer === 'dontknow' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 right-2 text-2xl"
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
      <div className="grid grid-cols-2 gap-4">
        {/* Vrai */}
        <motion.button
          initial={{ opacity: 0, x: -50, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          onClick={() => !disabled && onAnswer('vrai')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-2xl p-6 min-h-[140px]
            bg-gradient-to-br from-[#26890c] to-[#1a6b08]
            ${disabled && selectedAnswer !== 'vrai' ? 'opacity-50' : ''}
            ${selectedAnswer === 'vrai' ? 'ring-4 ring-white ring-offset-2 ring-offset-transparent scale-105' : ''}
            shadow-[0_8px_0_0_rgba(0,0,0,0.3)] hover:shadow-[0_6px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[6px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.05, y: -4 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <motion.span
              className="text-5xl"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              ✅
            </motion.span>
            <span className="text-white font-extrabold text-2xl">
              VRAI
            </span>
          </div>
          {selectedAnswer === 'vrai' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 right-2 text-3xl"
            >
              ✓
            </motion.div>
          )}
        </motion.button>

        {/* Faux */}
        <motion.button
          initial={{ opacity: 0, x: 50, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          onClick={() => !disabled && onAnswer('faux')}
          disabled={disabled}
          className={`
            relative overflow-hidden rounded-2xl p-6 min-h-[140px]
            bg-gradient-to-br from-[#e21b3c] to-[#b01530]
            ${disabled && selectedAnswer !== 'faux' ? 'opacity-50' : ''}
            ${selectedAnswer === 'faux' ? 'ring-4 ring-white ring-offset-2 ring-offset-transparent scale-105' : ''}
            shadow-[0_8px_0_0_rgba(0,0,0,0.3)] hover:shadow-[0_6px_0_0_rgba(0,0,0,0.3)]
            active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[6px]
            transition-all duration-100
          `}
          whileHover={disabled ? {} : { scale: 1.05, y: -4 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <motion.span
              className="text-5xl"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
            >
              ❌
            </motion.span>
            <span className="text-white font-extrabold text-2xl">
              FAUX
            </span>
          </div>
          {selectedAnswer === 'faux' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-2 left-2 text-3xl"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {question.options?.map((option, index) => {
          const style = qcmStyles[index % 4];
          const isSelected = selectedAnswer === option;

          return (
            <motion.button
              key={index}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                delay: index * 0.1,
                type: 'spring',
                stiffness: 200,
                damping: 15
              }}
              onClick={() => !disabled && onAnswer(option)}
              disabled={disabled}
              className={`
                relative overflow-hidden rounded-xl p-4 min-h-[70px]
                ${style.bg} text-white
                ${disabled && !isSelected ? 'opacity-50' : ''}
                ${isSelected ? 'ring-4 ring-white ring-offset-2 scale-105' : ''}
                shadow-[0_6px_0_0_rgba(0,0,0,0.3)]
                active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[4px]
                transition-all duration-100
              `}
              whileHover={disabled ? {} : { scale: 1.03, y: -3 }}
              whileTap={disabled ? {} : { scale: 0.97 }}
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-black text-xl">
                  {style.letter}
                </span>
                <span className="flex-1 text-left font-bold text-lg">
                  {option}
                </span>
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-2xl"
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

  // Joker button - available for all question types
  const renderJoker = () => (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 150 }}
      onClick={() => !disabled && onAnswer('joker')}
      disabled={disabled}
      className={`
        w-full relative overflow-hidden rounded-xl p-3
        bg-gradient-to-br from-amber-600 to-amber-700 border-2 border-amber-400
        ${disabled && selectedAnswer !== 'joker' ? 'opacity-40' : ''}
        ${selectedAnswer === 'joker' ? 'ring-4 ring-amber-300 ring-offset-2 scale-105' : ''}
        shadow-[0_4px_0_0_rgba(0,0,0,0.3)]
        active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] active:translate-y-[2px]
        transition-all duration-100
      `}
      whileHover={disabled ? {} : { scale: 1.02, y: -2 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
    >
      <div className="flex items-center justify-center gap-3">
        <span className="text-2xl">🃏</span>
        <div className="text-left">
          <span className="text-white font-bold text-base">JOKER</span>
          <span className="text-amber-200 text-xs ml-2">(-50 pts)</span>
        </div>
      </div>
      {selectedAnswer === 'joker' && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 text-xl"
        >
          ✓
        </motion.div>
      )}
    </motion.button>
  );

  return (
    <div className="space-y-6 w-full max-w-2xl mx-auto">
      {(question.type === 'A' || question.type === 'B') && renderTypeAB()}
      {question.type === 'C' && renderTypeC()}
      {question.type === 'D' && renderTypeD()}
      {question.type === 'E' && renderTypeE()}
      {question.type === 'F' && renderTypeF()}
      {question.type === 'G' && renderTypeG()}
      {question.type === 'H' && renderTypeH()}

      {/* Joker button for all types */}
      <div className="pt-2 border-t border-white/20">
        {renderJoker()}
      </div>
    </div>
  );
}
