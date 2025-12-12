import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import MuteButton from '../components/MuteButton';
import Countdown from '../components/Countdown';
import QuestionCard from '../components/QuestionCard';
import RevealCard from '../components/RevealCard';
import CategoryBadge from '../components/CategoryBadge';

export default function Game() {
  const {
    room,
    playerId,
    phase,
    currentQuestion,
    questionNumber,
    totalQuestions,
    myAnswer,
    otherAnswered,
    revealData,
    scores,
    submitAnswer,
    finalResults
  } = useGame();
  const { playSound } = useAudio();
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState(0);
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    if (!room) {
      navigate('/');
    }
  }, [room, navigate]);

  useEffect(() => {
    if (phase === 'finished' && finalResults) {
      navigate('/results');
    }
  }, [phase, finalResults, navigate]);

  useEffect(() => {
    if (currentQuestion) {
      setShowIntro(true);
      setTimeLeft(currentQuestion.timer);
      playSound('reveal');

      // Hide intro after animation
      const introTimer = setTimeout(() => {
        setShowIntro(false);
      }, 2000);

      return () => clearTimeout(introTimer);
    }
  }, [currentQuestion, playSound]);

  useEffect(() => {
    if (phase === 'question' && !showIntro && timeLeft > 0 && !myAnswer) {
      const timer = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timer);
            return 0;
          }
          if (t <= 5) {
            playSound('tick');
          }
          return t - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [phase, showIntro, timeLeft, myAnswer, playSound]);

  useEffect(() => {
    if (revealData) {
      if (revealData.correct) {
        playSound('correct');
      } else if (revealData.questionType !== 'C') {
        playSound('wrong');
      }
    }
  }, [revealData, playSound]);

  const handleAnswer = (answer: string) => {
    if (myAnswer) return;
    playSound('click');
    submitAnswer(answer);
  };

  if (!room || !currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  const player1Name = room.player1_name || 'Joueur 1';
  const player2Name = room.player2_name || 'Joueur 2';

  return (
    <div className="min-h-screen flex flex-col p-4">
      <MuteButton />

      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center justify-between mb-4"
      >
        <div className="flex items-center gap-2">
          <span className="text-white/70">Question</span>
          <span className="bg-primary/20 text-primary px-3 py-1 rounded-full font-bold">
            {questionNumber}/{totalQuestions}
          </span>
        </div>

        {/* Score display */}
        <div className="flex items-center gap-4 text-sm">
          <div className={`${playerId === 1 ? 'text-primary' : 'text-white/70'}`}>
            {player1Name}: <span className="font-bold">{scores.player1}</span>
          </div>
          <div className={`${playerId === 2 ? 'text-primary' : 'text-white/70'}`}>
            {player2Name}: <span className="font-bold">{scores.player2}</span>
          </div>
        </div>
      </motion.div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {/* Question intro animation */}
          {showIntro && (
            <motion.div
              key="intro"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="text-center"
            >
              <CategoryBadge category={currentQuestion.category} size="lg" />
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-6xl font-display font-bold text-white mt-4"
              >
                Question {questionNumber}
              </motion.p>
            </motion.div>
          )}

          {/* Question phase */}
          {!showIntro && phase === 'question' && (
            <motion.div
              key="question"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg"
            >
              <div className="text-center mb-4">
                <CategoryBadge category={currentQuestion.category} />
              </div>

              <Countdown
                timeLeft={timeLeft}
                maxTime={currentQuestion.timer}
                className="mb-6"
              />

              <QuestionCard
                question={currentQuestion}
                onAnswer={handleAnswer}
                disabled={!!myAnswer}
                selectedAnswer={myAnswer}
              />
            </motion.div>
          )}

          {/* Waiting phase */}
          {!showIntro && phase === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <div className="card p-8">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="text-4xl mb-4"
                >
                  {myAnswer ? '✓' : '⏳'}
                </motion.div>
                <p className="text-xl font-bold text-white mb-2">
                  {myAnswer ? 'Reponse enregistree !' : 'Temps ecoule !'}
                </p>
                <p className="text-white/70">
                  En attente de {playerId === 1 ? player2Name : player1Name}...
                </p>

                {otherAnswered && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-green-400 mt-4"
                  >
                    L'autre joueur a repondu !
                  </motion.p>
                )}
              </div>
            </motion.div>
          )}

          {/* Reveal phase */}
          {phase === 'reveal' && revealData && (
            <motion.div
              key="reveal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-lg"
            >
              <RevealCard
                question={currentQuestion}
                revealData={revealData}
                player1Name={player1Name}
                player2Name={player2Name}
                playerId={playerId!}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
