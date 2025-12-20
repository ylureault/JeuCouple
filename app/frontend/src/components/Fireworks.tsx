import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Particle {
  id: string;
  x: number;
  y: number;
  color: string;
  size: number;
  angle: number;
  velocity: number;
  type: 'spark' | 'circle' | 'star';
}

interface Firework {
  id: string;
  x: number;
  y: number;
  color: string;
  particles: Particle[];
}

const COLORS = ['#ff0000', '#ffd700', '#00ff00', '#00bfff', '#ff00ff', '#ff6b6b', '#feca57', '#48dbfb'];

function generateParticles(x: number, y: number, color: string): Particle[] {
  const particles: Particle[] = [];
  const particleCount = 20 + Math.floor(Math.random() * 15);

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      id: `${Date.now()}-${i}`,
      x,
      y,
      color: Math.random() > 0.7 ? COLORS[Math.floor(Math.random() * COLORS.length)] : color,
      size: 3 + Math.random() * 5,
      angle: (i / particleCount) * 360,
      velocity: 80 + Math.random() * 120,
      type: Math.random() > 0.6 ? 'spark' : Math.random() > 0.5 ? 'star' : 'circle',
    });
  }
  return particles;
}

export default function Fireworks() {
  const [fireworks, setFireworks] = useState<Firework[]>([]);

  useEffect(() => {
    // Launch initial burst
    const launchFirework = (delay: number) => {
      setTimeout(() => {
        const x = 20 + Math.random() * 60; // 20-80% of width
        const y = 20 + Math.random() * 40; // 20-60% of height
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];

        const newFirework: Firework = {
          id: `fw-${Date.now()}-${Math.random()}`,
          x,
          y,
          color,
          particles: generateParticles(x, y, color),
        };

        setFireworks((prev) => [...prev, newFirework]);

        // Remove after animation
        setTimeout(() => {
          setFireworks((prev) => prev.filter((fw) => fw.id !== newFirework.id));
        }, 1500);
      }, delay);
    };

    // Launch multiple fireworks in sequence
    launchFirework(0);
    launchFirework(200);
    launchFirework(400);
    launchFirework(700);
    launchFirework(1000);
    launchFirework(1400);

    return () => {};
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <AnimatePresence>
        {fireworks.map((fw) => (
          <div key={fw.id}>
            {/* Center burst flash */}
            <motion.div
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 3, opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute rounded-full"
              style={{
                left: `${fw.x}%`,
                top: `${fw.y}%`,
                width: 20,
                height: 20,
                background: `radial-gradient(circle, ${fw.color} 0%, transparent 70%)`,
                transform: 'translate(-50%, -50%)',
              }}
            />

            {/* Particles */}
            {fw.particles.map((particle) => {
              const rad = (particle.angle * Math.PI) / 180;
              const endX = Math.cos(rad) * particle.velocity;
              const endY = Math.sin(rad) * particle.velocity + 50; // gravity

              return (
                <motion.div
                  key={particle.id}
                  initial={{
                    left: `${fw.x}%`,
                    top: `${fw.y}%`,
                    scale: 1,
                    opacity: 1,
                  }}
                  animate={{
                    x: endX,
                    y: endY,
                    scale: 0,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 0.8 + Math.random() * 0.4,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                  className="absolute"
                  style={{
                    width: particle.size,
                    height: particle.size,
                    backgroundColor: particle.color,
                    borderRadius: particle.type === 'circle' ? '50%' : particle.type === 'star' ? '2px' : '50%',
                    boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              );
            })}

            {/* Sparkle trails */}
            {[...Array(8)].map((_, i) => {
              const angle = (i / 8) * 360;
              const rad = (angle * Math.PI) / 180;
              const distance = 60 + Math.random() * 40;

              return (
                <motion.div
                  key={`trail-${fw.id}-${i}`}
                  initial={{
                    left: `${fw.x}%`,
                    top: `${fw.y}%`,
                    opacity: 1,
                    scale: 1,
                  }}
                  animate={{
                    x: Math.cos(rad) * distance,
                    y: Math.sin(rad) * distance,
                    opacity: 0,
                    scale: 0.3,
                  }}
                  transition={{
                    duration: 0.6,
                    ease: 'easeOut',
                  }}
                  className="absolute text-lg"
                  style={{ transform: 'translate(-50%, -50%)' }}
                >
                  ✦
                </motion.div>
              );
            })}
          </div>
        ))}
      </AnimatePresence>

      {/* Confetti falling */}
      {[...Array(30)].map((_, i) => (
        <motion.div
          key={`confetti-${i}`}
          initial={{
            left: `${Math.random() * 100}%`,
            top: '-5%',
            rotate: 0,
            opacity: 1,
          }}
          animate={{
            top: '110%',
            rotate: Math.random() > 0.5 ? 720 : -720,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            delay: Math.random() * 1.5,
            ease: 'easeIn',
          }}
          className="absolute"
          style={{
            width: 8 + Math.random() * 6,
            height: 8 + Math.random() * 6,
            backgroundColor: COLORS[Math.floor(Math.random() * COLORS.length)],
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}
