import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ConfettiProps {
  count?: number;
}

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  rotation: number;
  scale: number;
}

const colors = [
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#2196F3', // Blue
  '#4CAF50', // Green
  '#FFEB3B', // Yellow
  '#FF5722', // Orange
  '#00BCD4', // Cyan
];

export default function Confetti({ count = 50 }: ConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    const newPieces: ConfettiPiece[] = [];
    for (let i = 0; i < count; i++) {
      newPieces.push({
        id: i,
        x: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.5,
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5
      });
    }
    setPieces(newPieces);
  }, [count]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {pieces.map((piece) => (
        <motion.div
          key={piece.id}
          initial={{
            top: '-5%',
            left: `${piece.x}%`,
            rotate: 0,
            opacity: 1
          }}
          animate={{
            top: '110%',
            rotate: piece.rotation + 720,
            opacity: 0
          }}
          transition={{
            duration: 2 + Math.random(),
            delay: piece.delay,
            ease: 'linear'
          }}
          style={{
            position: 'absolute',
            width: 12 * piece.scale,
            height: 12 * piece.scale,
            backgroundColor: piece.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px'
          }}
        />
      ))}
    </div>
  );
}
