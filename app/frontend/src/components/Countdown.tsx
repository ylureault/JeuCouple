import { motion } from 'framer-motion';

interface CountdownProps {
  timeLeft: number;
  maxTime: number;
  className?: string;
}

export default function Countdown({ timeLeft, maxTime, className = '' }: CountdownProps) {
  const progress = timeLeft / maxTime;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const getColor = () => {
    if (progress > 0.5) return '#E91E63';
    if (progress > 0.25) return '#FF9800';
    return '#E21B3C';
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 countdown-circle" viewBox="0 0 100 100">
          <circle
            className="countdown-circle-bg"
            cx="50"
            cy="50"
            r={radius}
            strokeWidth="8"
          />
          <motion.circle
            className="countdown-circle-progress"
            cx="50"
            cy="50"
            r={radius}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ stroke: getColor() }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            key={timeLeft}
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-3xl font-bold ${
              timeLeft <= 5 ? 'text-red-400' : 'text-white'
            }`}
          >
            {timeLeft}
          </motion.span>
        </div>
      </div>
    </div>
  );
}
