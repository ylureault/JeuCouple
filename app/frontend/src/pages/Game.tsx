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
import Lobby from './Lobby';

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
  const [introStep, setIntroStep] = useState<'number' | 'category' | 'question'>('number');

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
      setIntroStep('number');
      setTimeLeft(currentQuestion.timer);
      playSound('reveal');

      // Intro sequence
      const step1 = setTimeout(() => setIntroStep('category'), 800);
      const step2 = setTimeout(() => setIntroStep('question'), 1600);
      const step3 = setTimeout(() => setShowIntro(false), 3000);

      return () => {
        clearTimeout(step1);
        clearTimeout(step2);
        clearTimeout(step3);
      };
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

  // No room - redirect to home
  if (!room) {
    return (
      <div className="min-h-screen bg-[#46178f] flex items-center justify-center">
        <div className="spinner w-16 h-16" />
      </div>
    );
  }

  // Lobby phase - show lobby screen
  if (phase === 'lobby') {
    return <Lobby />;
  }

  // Game started but no question yet - loading
  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-[#46178f] flex items-center justify-center">
        <div className="spinner w-16 h-16" />
      </div>
    );
  }

  const player1Name = room.player1_name || 'Joueur 1';
  const player2Name = room.player2_name || 'Joueur 2';
  const myScore = playerId === 1 ? scores.player1 : scores.player2;
  const theirScore = playerId === 1 ? scores.player2 : scores.player1;
  const theirName = playerId === 1 ? player2Name : player1Name;

  return (
    <div className="min-h-screen bg-[#46178f] flex flex-col">
      <MuteButton />

      {/* Top bar */}
      <motion.div
        initial={{ y: -50 }}
        animate={{ y: 0 }}
        className="bg-black/20 px-4 py-3"
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Progress */}
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-sm font-semibold hidden sm:block">Question</span>
            <div className="bg-white/20 rounded-full px-4 py-1">
              <span className="font-black text-white">
                {questionNumber} <span className="text-white/50">/ {totalQuestions}</span>
              </span>
            </div>
          </div>

          {/* Scores */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-white/60 text-sm hidden sm:block">Toi</span>
              <div className="bg-[#26890c] rounded-lg px-3 py-1">
                <span className="font-black text-white">{myScore}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white/60 text-sm hidden sm:block">{theirName}</span>
              <div className="bg-white/20 rounded-lg px-3 py-1">
                <span className="font-bold text-white">{theirScore}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-6">
        <AnimatePresence mode="wait">
          {/* INTRO SEQUENCE */}
          {showIntro && (
            <motion.div
              key="intro"
              className="text-center w-full"
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
            >
              <AnimatePresence mode="wait">
                {/* Step 1: Question number */}
                {introStep === 'number' && (
                  <motion.div
                    key="number"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 2, opacity: 0 }}
                    transition={{ type: 'spring', damping: 15 }}
                    className="flex flex-col items-center"
                  >
                    <motion.span
                      className="text-[150px] md:text-[200px] font-black text-white text-shadow-strong"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 0.5 }}
                    >
                      {questionNumber}
                    </motion.span>
                  </motion.div>
                )}

                {/* Step 2: Category */}
                {introStep === 'category' && (
                  <motion.div
                    key="category"
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0 }}
                    transition={{ type: 'spring', damping: 20 }}
                    className="flex flex-col items-center gap-4"
                  >
                    <CategoryBadge category={currentQuestion.category} size="lg" />
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-white/60 text-xl font-semibold mt-4"
                    >
                      Preparez-vous...
                    </motion.p>
                  </motion.div>
                )}

                {/* Step 3: Question text */}
                {introStep === 'question' && (
                  <motion.div
                    key="question-intro"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ y: -30, opacity: 0 }}
                    transition={{ type: 'spring', damping: 20 }}
                    className="w-full max-w-2xl mx-auto px-4"
                  >
                    <div className="question-card">
                      <p className="text-2xl md:text-3xl">
                        {currentQuestion.text}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* QUESTION PHASE */}
          {!showIntro && phase === 'question' && (
            <motion.div
              key="question"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl mx-auto"
            >
              {/* Question card */}
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mb-6"
              >
                <div className="question-card relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <CategoryBadge category={currentQuestion.category} />
                  </div>
                  <p className="text-xl md:text-2xl pt-4">
                    {currentQuestion.text}
                  </p>
                  {currentQuestion.type === 'A' && (
                    <p className="text-gray-500 text-sm mt-3">
                      Devine ce que {theirName} va repondre !
                    </p>
                  )}
                  {currentQuestion.type === 'B' && (
                    <p className="text-gray-500 text-sm mt-3">
                      Points si vos reponses concordent !
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Countdown */}
              <div className="flex justify-center mb-6">
                <Countdown
                  timeLeft={timeLeft}
                  maxTime={currentQuestion.timer}
                />
              </div>

              {/* Answers */}
              <QuestionCard
                question={currentQuestion}
                onAnswer={handleAnswer}
                disabled={!!myAnswer}
                selectedAnswer={myAnswer}
                player1Name={player1Name}
                player2Name={player2Name}
                playerId={playerId!}
              />

              {/* Other player status */}
              {myAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 text-center"
                >
                  <div className="inline-flex items-center gap-3 bg-[#26890c] rounded-full px-6 py-3">
                    <motion.span
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="text-xl"
                    >
                      ✓
                    </motion.span>
                    <span className="text-white font-bold">
                      Reponse enregistree !
                    </span>
                  </div>
                  {!otherAnswered && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-white/60 mt-3 flex items-center justify-center gap-2"
                    >
                      <span>En attente de {theirName}</span>
                      <span className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.2 }}
                          >
                            .
                          </motion.span>
                        ))}
                      </span>
                    </motion.p>
                  )}
                  {otherAnswered && (
                    <motion.p
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-[#26890c] mt-3 font-bold"
                    >
                      {theirName} a repondu ! Revelation imminente...
                    </motion.p>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* WAITING PHASE */}
          {!showIntro && phase === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <motion.div
                className="bg-white/10 backdrop-blur rounded-3xl p-10"
                animate={{
                  boxShadow: [
                    '0 0 0 0 rgba(255,255,255,0)',
                    '0 0 0 20px rgba(255,255,255,0.1)',
                    '0 0 0 0 rgba(255,255,255,0)',
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="text-6xl mb-6"
                >
                  ⏳
                </motion.div>
                <p className="text-2xl font-bold text-white mb-2">
                  {myAnswer ? 'Reponse envoyee !' : 'Temps ecoule !'}
                </p>
                <p className="text-white/60">
                  En attente de {theirName}...
                </p>
              </motion.div>
            </motion.div>
          )}

          {/* REVEAL PHASE */}
          {phase === 'reveal' && revealData && (
            <motion.div
              key="reveal"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-2xl mx-auto"
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
