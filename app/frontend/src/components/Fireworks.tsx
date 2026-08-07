import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FireworksProps {
  show?: boolean;
  onComplete?: () => void;
}

export default function Fireworks({ show = true, onComplete }: FireworksProps) {
  const [particles, setParticles] = useState<Array<{
    id: number;
    x: number;
    y: number;
    color: string;
    size: number;
    angle: number;
    velocity: number;
  }>>([]);

  // Les appelants montent Fireworks avec show=true en permanence. Sans cet etat,
  // seules les particules s'effacaient au bout de 2,5 s : le bandeau "PARFAIT !"
  // restait affiche par-dessus toute la carte de resultat.
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (show) {
      setActive(true);
      const colors = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff8800', '#ffffff'];
      const newParticles: typeof particles = [];

      const bursts = [
        { x: 30, y: 40 },
        { x: 50, y: 30 },
        { x: 70, y: 45 },
      ];

      bursts.forEach((burst, burstIndex) => {
        for (let i = 0; i < 30; i++) {
          newParticles.push({
            id: burstIndex * 100 + i,
            x: burst.x,
            y: burst.y,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 8 + 4,
            angle: (Math.PI * 2 * i) / 30 + Math.random() * 0.3,
            velocity: Math.random() * 150 + 100,
          });
        }
      });

      setParticles(newParticles);

      const timer = setTimeout(() => {
        setParticles([]);
        setActive(false);
        onComplete?.();
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {active && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute rounded-full"
              style={{
                width: particle.size,
                height: particle.size,
                backgroundColor: particle.color,
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                boxShadow: `0 0 ${particle.size}px ${particle.color}`,
              }}
              initial={{ opacity: 1, scale: 0 }}
              animate={{
                opacity: [1, 1, 0],
                scale: [0, 1.5, 0.5],
                x: Math.cos(particle.angle) * particle.velocity,
                y: Math.sin(particle.angle) * particle.velocity + 50,
              }}
              transition={{ duration: 2, ease: 'easeOut' }}
            />
          ))}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-center">
              <motion.span
                className="text-6xl md:text-8xl block"
                animate={{ rotate: [0, -5, 5, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 0.5, repeat: 3 }}
              >
                🎆
              </motion.span>
              <motion.p
                className="text-white font-black text-3xl md:text-5xl mt-4 text-shadow-strong"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              >
                PARFAIT !
              </motion.p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Confetti({ show }: { show: boolean }) {
  const [confettiPieces, setConfettiPieces] = useState<Array<{
    id: number;
    x: number;
    color: string;
    delay: number;
    rotation: number;
  }>>([]);

  useEffect(() => {
    if (show) {
      const colors = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ff8800', '#4444ff'];
      const pieces: typeof confettiPieces = [];

      for (let i = 0; i < 50; i++) {
        pieces.push({
          id: i,
          x: Math.random() * 100,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 0.5,
          rotation: Math.random() * 360,
        });
      }

      setConfettiPieces(pieces);
      const timer = setTimeout(() => setConfettiPieces([]), 3000);
      return () => clearTimeout(timer);
    }
  }, [show]);

  return (
    <AnimatePresence>
      {confettiPieces.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
          {confettiPieces.map((piece) => (
            <motion.div
              key={piece.id}
              className="absolute w-3 h-3"
              style={{
                left: `${piece.x}%`,
                top: -20,
                backgroundColor: piece.color,
                borderRadius: Math.random() > 0.5 ? '50%' : '0%',
              }}
              initial={{ y: -20, rotate: 0, opacity: 1 }}
              animate={{
                y: window.innerHeight + 50,
                rotate: piece.rotation + 720,
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 2.5, delay: piece.delay, ease: 'easeIn' }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
