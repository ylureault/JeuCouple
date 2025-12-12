import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Question } from '../../../shared/types';

interface QuestionCardProps {
  question: Question;
  onAnswer: (answer: string) => void;
  disabled: boolean;
  selectedAnswer: string | null;
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
  selectedAnswer
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

  return (
    <div className="space-y-6 w-full max-w-2xl mx-auto">
      {(question.type === 'A' || question.type === 'B') && renderTypeAB()}
      {question.type === 'C' && renderTypeC()}
      {question.type === 'D' && renderTypeD()}
    </div>
  );
}
