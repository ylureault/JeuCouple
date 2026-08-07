import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';
import MuteButton from '../components/MuteButton';
import Countdown from '../components/Countdown';
import QuestionCard from '../components/QuestionCard';
import RevealCard from '../components/RevealCard';
import CategoryBadge from '../components/CategoryBadge';
import ReactionBar from '../components/ReactionBar';
import ReactionOverlay from '../components/ReactionOverlay';
import TextReactionBar from '../components/TextReactionBar';
import TextReactionOverlay from '../components/TextReactionOverlay';
import VoiceChat from '../components/VoiceChat';
import GameAlerts from '../components/GameAlerts';
// Sans ce composant monte, les evenements game:sound-reaction arrivaient bien
// dans le state mais aucun son n'etait joue : la fonctionnalite etait inerte.
import SoundReactionHandler from '../components/SoundReactionHandler';
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
    finalResults,
    gamePaused,
    disconnectedPlayerName,
    requestPause,
  } = useGame();
  const { playSound } = useAudio();
  // Doit rester avec les autres hooks, AVANT tout return conditionnel :
  // appele plus bas, il changeait le nombre de hooks entre deux rendus
  // (React: "Rendered more hooks than during the previous render").
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [timeLeft, setTimeLeft] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [introStep, setIntroStep] = useState<'number' | 'category' | 'question'>('number');

  // If no room and no valid code in URL, go home
  useEffect(() => {
    if (!room && !code) {
      navigate('/');
    }
  }, [room, code, navigate]);

  // Navigate to results when game finishes (with room code in URL)
  useEffect(() => {
    if (phase === 'finished' && finalResults && room?.code) {
      navigate(`/results/${room.code}`);
    }
  }, [phase, finalResults, navigate, room?.code]);

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
    // Only start timer when in question phase, intro is done, no answer given, and not paused
    if (phase !== 'question' || showIntro || myAnswer || gamePaused) {
      return;
    }

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
  }, [phase, showIntro, myAnswer, gamePaused, playSound]); // gamePaused stops/resumes timer

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
      <div className="min-h-[100dvh] bg-[#46178f] flex items-center justify-center">
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
      <div className="min-h-[100dvh] bg-[#46178f] flex items-center justify-center">
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
    <div className={`min-h-[100dvh] bg-gradient-to-br ${theme.colors.background} flex flex-col pb-20`}>
      <ReactionOverlay />
      <TextReactionOverlay />
      <SoundReactionHandler />
      <GameAlerts
        otherAnswered={otherAnswered}
        myAnswer={myAnswer}
        myScore={myScore}
        theirScore={theirScore}
        theirName={theirName}
        questionNumber={questionNumber}
      />

      {/* Pause overlay when partner disconnected or manual pause */}
      <AnimatePresence>
        {gamePaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="text-center max-w-md mx-4"
            >
              {/* Pulsing pause icon */}
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-8xl mb-6"
              >
                ⏸️
              </motion.div>

              {disconnectedPlayerName && !disconnectedPlayerName.toLowerCase().includes('pause') ? (
                <>
                  {/* Disconnected message */}
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="bg-red-500/20 border border-red-500/40 rounded-2xl p-4 mb-6"
                  >
                    <p className="text-red-400 text-lg font-bold flex items-center justify-center gap-2">
                      <span className="animate-pulse">🔴</span>
                      {disconnectedPlayerName}
                    </p>
                  </motion.div>
                  <h2 className="text-3xl font-black text-white mb-3">
                    Le jeu est en pause
                  </h2>
                  <p className="text-white/70 text-lg mb-6">
                    En attente de reconnexion...
                  </p>
                  <div className="flex justify-center gap-2">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-4 h-4 bg-yellow-400 rounded-full"
                        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                        transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {/* Manual pause */}
                  <h2 className="text-3xl font-black text-white mb-3">
                    Jeu en pause
                  </h2>
                  <p className="text-white/70 text-lg mb-6">
                    Prenez un moment pour souffler...
                  </p>
                  <motion.button
                    onClick={requestPause}
                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg py-4 px-8 rounded-2xl shadow-lg"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    ▶️ Reprendre le jeu
                  </motion.button>
                  {/* WhatsApp button during pause */}
                  <motion.a
                    href={`https://wa.me/?text=${encodeURIComponent("Viens, on en parle ! 💬")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 bg-[#25D366] text-white font-bold py-3 px-6 rounded-xl shadow-lg"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <span className="text-xl">💬</span>
                    Viens on en parle sur WhatsApp
                  </motion.a>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact top bar with all controls */}
      <motion.div
        initial={{ y: -50 }}
        animate={{ y: 0 }}
        className="bg-black/30 px-2 py-2 sticky top-0 z-50"
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          {/* Left: Question progress */}
          <div className="bg-white/20 rounded-full px-3 py-1 flex-shrink-0">
            <span className="font-bold text-white text-sm">
              {questionNumber}<span className="text-white/50">/{totalQuestions}</span>
            </span>
          </div>

          {/* Center: Scores */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-white/60 text-xs">Toi</span>
              <div className="bg-[#26890c] rounded px-2 py-0.5">
                <span className="font-bold text-white text-sm">{myScore}</span>
              </div>
            </div>
            <span className="text-white/40">vs</span>
            <div className="flex items-center gap-1">
              <div className="bg-white/20 rounded px-2 py-0.5">
                <span className="font-bold text-white text-sm">{theirScore}</span>
              </div>
              <span className="text-white/60 text-xs truncate max-w-[60px]">{theirName}</span>
            </div>
          </div>

          {/* Right: Pause, voice, mute */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <motion.button
              onClick={requestPause}
              className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white text-sm"
              whileTap={{ scale: 0.9 }}
              title="Pause"
            >
              ⏸
            </motion.button>
            <VoiceChat compact />
            <MuteButton compact />
          </div>
        </div>
      </motion.div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-start p-2 sm:p-4 pb-16 overflow-y-auto">
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
                      Préparez-vous...
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
                className="mb-3"
              >
                <div className="question-card relative py-3 px-4">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <CategoryBadge category={currentQuestion.category} />
                  </div>
                  <p className="text-lg md:text-xl pt-3">
                    {currentQuestion.text}
                  </p>
                  {currentQuestion.type === 'A' && (
                    <p className="text-gray-500 text-xs mt-1">
                      Devine ce que {theirName} va répondre !
                    </p>
                  )}
                  {currentQuestion.type === 'B' && (
                    <p className="text-gray-500 text-xs mt-1">
                      Points si vos réponses concordent !
                    </p>
                  )}
                  {currentQuestion.type === 'G' && (
                    <p className="text-gray-500 text-xs mt-1">
                      Vrai ou Faux ? Points si vos réponses concordent !
                    </p>
                  )}
                  {currentQuestion.type === 'H' && (
                    <p className="text-gray-500 text-xs mt-1">
                      Culture G : chacun gagne des points s'il a la bonne réponse !
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Countdown */}
              <div className="flex justify-center mb-3">
                <Countdown
                  timeLeft={timeLeft}
                  maxTime={currentQuestion.timer}
                />
              </div>

              {/* Answers */}
              {/* key = remonte le composant a chaque question, sinon son etat local
                  (texte saisi, position du curseur 1-10) persiste d'une question a l'autre.
                  disabled inclut timeLeft === 0 : le serveur revele les reponses a
                  l'expiration du minuteur, l'interface restait active apres le decompte
                  et acceptait une reponse qui n'etait plus prise en compte. */}
              <QuestionCard
                key={currentQuestion.id}
                question={currentQuestion}
                onAnswer={handleAnswer}
                disabled={!!myAnswer || timeLeft === 0}
                selectedAnswer={myAnswer}
                player1Name={player1Name}
                player2Name={player2Name}
                playerId={playerId!}
              />

              {/* Other player status */}
              {myAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 text-center"
                >
                  <div className="inline-flex items-center gap-2 bg-[#26890c] rounded-full px-4 py-2">
                    <motion.span
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="text-base"
                    >
                      ✓
                    </motion.span>
                    <span className="text-white font-bold text-sm">
                      Réponse enregistrée !
                    </span>
                  </div>
                  {!otherAnswered && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-white/60 mt-2 text-sm flex items-center justify-center gap-1"
                    >
                      <span>En attente de {theirName}</span>
                      <span className="flex">
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
                      className="text-[#26890c] mt-2 font-bold text-sm"
                    >
                      {theirName} a répondu ! Révélation imminente...
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
                className="bg-white/10 backdrop-blur rounded-2xl p-6"
                animate={{
                  boxShadow: [
                    '0 0 0 0 rgba(255,255,255,0)',
                    '0 0 0 15px rgba(255,255,255,0.1)',
                    '0 0 0 0 rgba(255,255,255,0)',
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="text-4xl mb-3"
                >
                  ⏳
                </motion.div>
                <p className="text-xl font-bold text-white mb-1">
                  {myAnswer ? 'Réponse envoyée !' : 'Temps écoulé !'}
                </p>
                <p className="text-white/60 text-sm">
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
                currentScore1={scores.player1}
                currentScore2={scores.player2}
              />
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Fixed Reaction Bar at bottom - always visible during game */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-0 left-0 right-0 bg-black/40 backdrop-blur-sm py-2 px-2 border-t border-white/10 z-40 space-y-1.5"
      >
        <TextReactionBar />
        <ReactionBar />
      </motion.div>
    </div>
  );
}
