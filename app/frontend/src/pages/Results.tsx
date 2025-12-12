import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import MuteButton from '../components/MuteButton';
import Confetti from '../components/Confetti';
import HeartIcon from '../components/HeartIcon';

export default function Results() {
  const { room, playerId, finalResults, resetGame } = useGame();
  const { playSound } = useAudio();
  const navigate = useNavigate();

  useEffect(() => {
    if (!finalResults || !room) {
      navigate('/');
      return;
    }
    playSound('fanfare');
  }, [finalResults, room, navigate, playSound]);

  const handlePlayAgain = () => {
    playSound('click');
    resetGame();
    navigate('/');
  };

  if (!finalResults || !room) return null;

  const player1Name = room.player1_name || 'Joueur 1';
  const player2Name = room.player2_name || 'Joueur 2';

  const isWinner =
    (playerId === 1 && finalResults.winner === 1) ||
    (playerId === 2 && finalResults.winner === 2);

  const isTie = finalResults.winner === 'tie';

  const getWinnerMessage = () => {
    if (isTie) return 'Egalite parfaite !';
    if (isWinner) return 'Tu as gagne !';
    return 'Tu as perdu...';
  };

  const getSubMessage = () => {
    const totalPoints = finalResults.score1 + finalResults.score2;
    const maxPoints = finalResults.totalQuestions * 200;
    const percentage = Math.round((totalPoints / maxPoints) * 100);

    if (percentage >= 80) return 'Vous vous connaissez vraiment bien !';
    if (percentage >= 50) return 'Pas mal ! Vous pouvez encore progresser.';
    return 'Il est temps d\'apprendre a mieux vous connaitre !';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <MuteButton />

      {(isWinner || isTie) && <Confetti />}

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.6 }}
        className="text-center w-full max-w-md"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}
        >
          <HeartIcon className="w-24 h-24 mx-auto mb-6 text-primary" />
        </motion.div>

        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className={`text-4xl font-display font-bold mb-2 ${
            isTie ? 'text-yellow-400' : isWinner ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {getWinnerMessage()}
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/70 mb-8"
        >
          {getSubMessage()}
        </motion.p>

        {/* Podium */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-end justify-center gap-4 mb-8"
        >
          <PlayerPodium
            name={player1Name}
            score={finalResults.score1}
            isWinner={finalResults.winner === 1}
            isTie={isTie}
            position={finalResults.winner === 2 ? 2 : 1}
            isYou={playerId === 1}
          />
          <PlayerPodium
            name={player2Name}
            score={finalResults.score2}
            isWinner={finalResults.winner === 2}
            isTie={isTie}
            position={finalResults.winner === 1 ? 2 : 1}
            isYou={playerId === 2}
          />
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="card mb-6"
        >
          <h3 className="text-lg font-bold mb-4">Statistiques</h3>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold text-primary">
                {finalResults.totalQuestions}
              </p>
              <p className="text-white/50 text-sm">Questions</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-secondary">
                {Math.round(
                  ((finalResults.score1 + finalResults.score2) /
                    (finalResults.totalQuestions * 200)) *
                    100
                )}%
              </p>
              <p className="text-white/50 text-sm">Compatibilite</p>
            </div>
          </div>
        </motion.div>

        <motion.button
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          onClick={handlePlayAgain}
          className="btn-primary w-full text-xl"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Rejouer
        </motion.button>
      </motion.div>
    </div>
  );
}

interface PlayerPodiumProps {
  name: string;
  score: number;
  isWinner: boolean;
  isTie: boolean;
  position: 1 | 2;
  isYou: boolean;
}

function PlayerPodium({
  name,
  score,
  isWinner,
  isTie,
  position,
  isYou
}: PlayerPodiumProps) {
  const height = isWinner || isTie ? 'h-32' : 'h-24';
  const bgColor =
    isWinner || isTie
      ? 'bg-gradient-to-t from-primary to-secondary'
      : 'bg-white/20';

  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: position === 1 ? 0.5 : 0.6, type: 'spring' }}
      className="flex flex-col items-center"
    >
      {(isWinner || (isTie && position === 1)) && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.8, type: 'spring' }}
          className="text-4xl mb-2"
        >
          {isTie ? '🤝' : '👑'}
        </motion.div>
      )}

      <div className="mb-2 text-center">
        <p className="font-bold text-white">{name}</p>
        {isYou && (
          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
            Toi
          </span>
        )}
      </div>

      <motion.div
        initial={{ height: 0 }}
        animate={{ height: 'auto' }}
        transition={{ delay: 0.7, duration: 0.3 }}
        className={`w-28 ${height} ${bgColor} rounded-t-xl flex items-center justify-center`}
      >
        <span className="text-2xl font-bold text-white">{score}</span>
      </motion.div>
    </motion.div>
  );
}
