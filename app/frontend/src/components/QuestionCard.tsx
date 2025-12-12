import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Question } from '../../../shared/types';

interface QuestionCardProps {
  question: Question;
  onAnswer: (answer: string) => void;
  disabled: boolean;
  selectedAnswer: string | null;
}

const buttonColors = [
  'btn-kahoot-red',
  'btn-kahoot-blue',
  'btn-kahoot-yellow',
  'btn-kahoot-green'
];

const shapes = [
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" key="triangle">
    <polygon points="12,2 22,22 2,22" />
  </svg>,
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" key="diamond">
    <polygon points="12,2 22,12 12,22 2,12" />
  </svg>,
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" key="circle">
    <circle cx="12" cy="12" r="10" />
  </svg>,
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" key="square">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
];

export default function QuestionCard({
  question,
  onAnswer,
  disabled,
  selectedAnswer
}: QuestionCardProps) {
  const [scaleValue, setScaleValue] = useState(5);

  const renderTypeAB = () => (
    <div className="grid grid-cols-2 gap-3">
      {question.options?.map((option, index) => (
        <motion.button
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          onClick={() => onAnswer(option)}
          disabled={disabled}
          className={`
            ${buttonColors[index % 4]}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${selectedAnswer === option ? 'ring-4 ring-white' : ''}
          `}
          whileHover={disabled ? {} : { scale: 1.02 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          {shapes[index % 4]}
          <span className="text-lg font-bold">{option}</span>
        </motion.button>
      ))}
    </div>
  );

  const renderTypeC = () => {
    const [text, setText] = useState('');

    const handleSubmit = () => {
      if (text.trim()) {
        onAnswer(text.trim());
      }
    };

    return (
      <div className="space-y-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ta reponse..."
          className="input-field h-32 resize-none"
          disabled={disabled}
          maxLength={500}
        />
        <motion.button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="btn-primary w-full disabled:opacity-50"
          whileHover={disabled ? {} : { scale: 1.02 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          Valider ma reponse
        </motion.button>
      </div>
    );
  };

  const renderTypeD = () => {
    const handleSubmit = () => {
      onAnswer(scaleValue.toString());
    };

    return (
      <div className="space-y-6">
        <div className="text-center">
          <motion.span
            key={scaleValue}
            initial={{ scale: 1.5 }}
            animate={{ scale: 1 }}
            className="text-6xl font-bold text-primary"
          >
            {scaleValue}
          </motion.span>
          <span className="text-white/50">/10</span>
        </div>

        <div className="px-4">
          <input
            type="range"
            min="1"
            max="10"
            value={scaleValue}
            onChange={(e) => setScaleValue(parseInt(e.target.value))}
            disabled={disabled}
            className="w-full"
          />
          <div className="flex justify-between text-white/50 text-sm mt-2">
            <span>1</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>

        <motion.button
          onClick={handleSubmit}
          disabled={disabled}
          className="btn-primary w-full disabled:opacity-50"
          whileHover={disabled ? {} : { scale: 1.02 }}
          whileTap={disabled ? {} : { scale: 0.98 }}
        >
          Valider
        </motion.button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card text-center"
      >
        <p className="text-xl md:text-2xl font-bold text-white">
          {question.text}
        </p>
        {question.type === 'A' && (
          <p className="text-white/50 text-sm mt-2">
            Devine ce que ton/ta partenaire va repondre !
          </p>
        )}
        {question.type === 'B' && (
          <p className="text-white/50 text-sm mt-2">
            Repondez tous les deux - point si vos reponses concordent !
          </p>
        )}
      </motion.div>

      {(question.type === 'A' || question.type === 'B') && renderTypeAB()}
      {question.type === 'C' && renderTypeC()}
      {question.type === 'D' && renderTypeD()}
    </div>
  );
}
