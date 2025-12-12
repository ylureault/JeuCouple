import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CountdownProps {
  timeLeft: number;
  maxTime: number;
  onTimeUp?: () => void;
}

export default function Countdown({ timeLeft, maxTime, onTimeUp }: CountdownProps) {
  const [prevTime, setPrevTime] = useState(timeLeft);
  const progress = timeLeft / maxTime;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const isUrgent = timeLeft <= 5;
  const isVeryUrgent = timeLeft <= 3;

  useEffect(() => {
    if (timeLeft !== prevTime) {
      setPrevTime(timeLeft);
    }
    if (timeLeft === 0 && onTimeUp) {
      onTimeUp();
    }
  }, [timeLeft, prevTime, onTimeUp]);

  const getColor = () => {
    if (progress > 0.5) return '#26890c';
    if (progress > 0.25) return '#d89e00';
    return '#e21b3c';
  };

  return (
    <div className="countdown-container">
      {/* Background glow effect */}
      <motion.div
        className="absolute inset-0 rounded-full blur-xl"
        animate={{
          backgroundColor: isVeryUrgent
            ? ['rgba(226, 27, 60, 0.3)', 'rgba(226, 27, 60, 0.6)', 'rgba(226, 27, 60, 0.3)']
            : 'rgba(255, 255, 255, 0.1)',
          scale: isVeryUrgent ? [1, 1.1, 1] : 1,
        }}
        transition={{
          duration: 0.5,
          repeat: isVeryUrgent ? Infinity : 0,
        }}
      />

      {/* SVG Circle */}
      <svg className="countdown-circle w-full h-full" viewBox="0 0 140 140">
        <circle
          className="countdown-bg"
          cx="70"
          cy="70"
          r={radius}
        />
        <motion.circle
          className="countdown-progress"
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ stroke: getColor() }}
          initial={false}
          animate={{
            strokeDashoffset,
            stroke: getColor(),
          }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </svg>

      {/* Time display */}
      <div className={`countdown-text ${isUrgent ? 'countdown-urgent' : ''}`}>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={timeLeft}
            initial={{ y: -30, opacity: 0, scale: 1.5 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.5 }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20
            }}
            style={{ color: isUrgent ? '#e21b3c' : 'white' }}
          >
            {timeLeft}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Tick marks for urgency */}
      {isUrgent && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        >
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-3 bg-white/30 rounded-full"
              style={{
                transform: `rotate(${i * 30}deg) translateY(-60px)`,
              }}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}

export function MiniCountdown({ timeLeft, maxTime }: { timeLeft: number; maxTime: number }) {
  const progress = (timeLeft / maxTime) * 100;
  const isUrgent = timeLeft <= 5;

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-3 bg-white/20 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={false}
          animate={{
            width: `${progress}%`,
            backgroundColor: isUrgent ? '#e21b3c' : '#26890c',
          }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </div>
      <motion.span
        className={`font-bold text-lg min-w-[2ch] ${isUrgent ? 'text-[#e21b3c]' : 'text-white'}`}
        animate={isUrgent ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.5, repeat: isUrgent ? Infinity : 0 }}
      >
        {timeLeft}
      </motion.span>
    </div>
  );
}
