import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { GAME_MODES } from '../../../shared/types';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';
import MuteButton from '../components/MuteButton';
import Confetti from '../components/Confetti';
import Fireworks from '../components/Fireworks';
import ReactionBar from '../components/ReactionBar';
import ReactionOverlay from '../components/ReactionOverlay';
import GameChat from '../components/GameChat';
import TextReactionOverlay from '../components/TextReactionOverlay';
import type { CategoryScore, Gender, QuestionHistory } from '../../../shared/types';

// Category icons mapping
const CATEGORY_ICONS: Record<string, string> = {
  couple: '❤️',
  preferences: '⭐',
  habitudes: '🏠',
  souvenirs: '📸',
  projets: '🚀',
  sexy: '🔥',
  coquin: '😈',
  fun: '🎉',
  profond: '💭',
  culture: '🧠',
  comportement: '🎭',
  communication: '💬',
  fantasmes: '💭',
  fellation: '👄',
  cunnilingus: '👅',
  sodomie: '🍑',
  kamasutra: '🧘',
  bdsm: '⛓️',
  preliminaires: '💋',
  sextoys: '🎀',
  confessions: '🤫',
  seduction: '😏',
  massage: '💆',
  jeux_role: '🎭',
  public: '🏖️',
  extreme: '🔞',
  intime: '💋',
  humour: '😂'
};

// Firework burst component
function Firework({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  const colors = ['#ff0000', '#ffd700', '#00ff00', '#00bfff', '#ff1493', '#ff8c00'];
  const particles = 12;

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
    >
      {[...Array(particles)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-3 h-3 rounded-full"
          style={{
            backgroundColor: colors[i % colors.length],
            boxShadow: `0 0 6px ${colors[i % colors.length]}`
          }}
          initial={{ scale: 0, x: 0, y: 0 }}
          animate={{
            scale: [0, 1, 0],
            x: Math.cos((i * 360 / particles) * Math.PI / 180) * 80,
            y: Math.sin((i * 360 / particles) * Math.PI / 180) * 80,
            opacity: [1, 1, 0]
          }}
          transition={{
            delay: delay,
            duration: 1,
            ease: 'easeOut'
          }}
        />
      ))}
    </motion.div>
  );
}

// Category breakdown bar component
function CategoryBar({ category, delay = 0 }: { category: CategoryScore; delay?: number }) {
  const icon = CATEGORY_ICONS[category.category] || '📌';
  const compatColor = category.compatibility >= 80 ? 'bg-green-500' :
                      category.compatibility >= 60 ? 'bg-yellow-500' :
                      category.compatibility >= 40 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center gap-3"
    >
      <span className="text-xl w-8">{icon}</span>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-semibold text-gray-700 capitalize">{category.category}</span>
          <span className="text-sm font-bold text-[#a3235e]">{category.compatibility}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${category.compatibility}%` }}
            transition={{ delay: delay + 0.2, duration: 0.8, ease: 'easeOut' }}
            className={`h-full ${compatColor} rounded-full`}
          />
        </div>
      </div>
    </motion.div>
  );
}

export default function Results() {
  const { room, playerId, finalResults, restartGame, phase, gameSettings } = useGame();
  const { playSound } = useAudio();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [showPodium, setShowPodium] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [drumroll, setDrumroll] = useState(true);
  const [showCategories, setShowCategories] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Calculate if this is a perfect score (100% compatibility or all matches)
  const isPerfectScore = finalResults
    ? finalResults.perfectMatches === finalResults.totalQuestions ||
      ((finalResults.score1 + finalResults.score2) / (finalResults.totalQuestions * 200)) >= 1
    : false;

  // Navigate to lobby when restart happens (with room code in URL)
  useEffect(() => {
    if (phase === 'lobby' && room?.code) {
      navigate(`/salon/${room.code}`);
    }
  }, [phase, room?.code, navigate]);

  useEffect(() => {
    if (!finalResults && !code) {
      navigate('/');
      return;
    }
    if (!finalResults || !room) return;

    // Dramatic reveal sequence
    const timer0 = setTimeout(() => setDrumroll(false), 1500);
    const timer1 = setTimeout(() => setShowPodium(true), 1600);
    const timer2 = setTimeout(() => {
      setShowFireworks(true);
      playSound('fanfare');
    }, 2500);
    const timer3 = setTimeout(() => setShowStats(true), 3000);
    const timer4 = setTimeout(() => setShowCategories(true), 3500);

    return () => {
      clearTimeout(timer0);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [finalResults, room, navigate, playSound]);

  const handlePlayAgain = async () => {
    playSound('click');
    try {
      await restartGame();
      // Navigation happens via useEffect when phase changes to 'lobby'
    } catch (error) {
      console.error('Failed to restart game:', error);
    }
  };

  const { theme } = useTheme();

  if (!finalResults || !room) return null;

  const player1Name = room.player1_name || 'Joueur 1';
  const player2Name = room.player2_name || 'Joueur 2';

  const isWinner =
    (playerId === 1 && finalResults.winner === 1) ||
    (playerId === 2 && finalResults.winner === 2);

  const isTie = finalResults.winner === 'tie';

  const totalPoints = finalResults.score1 + finalResults.score2;
  const maxPoints = finalResults.totalQuestions * 200;
  // Une partie sans question donnait 0/0 => "NaN%" affiche a l'ecran.
  // Le score peut aussi depasser le maximum theorique via les bonus de rapidite
  // et de serie : on borne a 100 pour ne pas afficher "124% de compatibilite".
  const compatibility = maxPoints > 0
    ? Math.min(100, Math.round((totalPoints / maxPoints) * 100))
    : 0;

  // Gamification stats
  const myMaxStreak = playerId === 1 ? finalResults.maxStreak1 : finalResults.maxStreak2;
  const mySpeedBonus = playerId === 1 ? finalResults.speedBonusTotal1 : finalResults.speedBonusTotal2;
  const bestCategory = finalResults.categoryScores?.[0];

  // Modes cooperatifs/sans points (P1-7) : l'ecran criait "Tu as gagne !"
  // avec podium la ou le jeu promettait "sans points — juste vous deux".
  const scorelessResult = GAME_MODES.find((m) => m.id === gameSettings?.gameMode)?.scoreless
    || gameSettings?.gameMode === 'complices';

  const getHeadline = () => {
    if (scorelessResult) return { emoji: '💞', text: 'Vous deux, tout simplement' };
    if (isTie) return { emoji: '🤝', text: 'Égalité parfaite !' };
    if (isWinner) return { emoji: '🏆', text: 'Tu as gagné !' };
    return { emoji: '💪', text: 'Belle tentative !' };
  };

  const getCompatibilityMessage = () => {
    if (compatibility >= 80) return { emoji: '💕', text: 'Vous vous connaissez par cœur !' };
    if (compatibility >= 60) return { emoji: '😊', text: 'Belle complicité !' };
    if (compatibility >= 40) return { emoji: '🌱', text: 'Votre histoire ne fait que commencer...' };
    return { emoji: '💬', text: 'Prenez le temps de vous découvrir !' };
  };

  const headline = getHeadline();
  const compatMessage = getCompatibilityMessage();

  return (
    <div className={`min-h-[100dvh] bg-gradient-to-br ${theme.colors.background} flex flex-col overflow-x-hidden relative pb-24`}>
      <MuteButton />
      <ReactionOverlay />
      <TextReactionOverlay />

      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-white/20 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.5, 0.2],
              scale: [1, 1.5, 1]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2
            }}
          />
        ))}
      </div>

      {/* Fireworks layer - extra spectacular for perfect score */}
      {showFireworks && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <Fireworks />
          <Confetti count={isPerfectScore ? 200 : 100} />
          <Firework x={20} y={20} delay={0} />
          <Firework x={80} y={25} delay={0.3} />
          <Firework x={50} y={15} delay={0.6} />
          <Firework x={30} y={35} delay={0.9} />
          <Firework x={70} y={40} delay={1.2} />
          {/* Extra fireworks for perfect score! */}
          {isPerfectScore && (
            <>
              <Firework x={10} y={30} delay={1.5} />
              <Firework x={90} y={35} delay={1.8} />
              <Firework x={40} y={50} delay={2.1} />
              <Firework x={60} y={45} delay={2.4} />
              <Firework x={25} y={55} delay={2.7} />
              <Firework x={75} y={60} delay={3.0} />
            </>
          )}
        </div>
      )}

      {/* Perfect score special banner */}
      <AnimatePresence>
        {showFireworks && isPerfectScore && (
          <motion.div
            initial={{ opacity: 0, scale: 0, y: -100 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ delay: 1.5, type: 'spring', stiffness: 100 }}
            className="fixed top-1/4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none"
          >
            <motion.div
              className="bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 rounded-2xl px-8 py-4 shadow-2xl"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(255,215,0,0.5)',
                  '0 0 40px rgba(255,215,0,0.8)',
                  '0 0 20px rgba(255,215,0,0.5)'
                ]
              }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <motion.p
                className="text-white font-black text-3xl md:text-4xl text-center text-shadow-strong"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              >
                🌟 SCORE PARFAIT ! 🌟
              </motion.p>
              <p className="text-white/90 text-center text-lg font-semibold mt-1">
                Vous êtes faits l'un pour l'autre ! 💕
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drumroll overlay */}
      <AnimatePresence>
        {drumroll && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 2 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-50 bg-[#1a0a2e] flex items-center justify-center"
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="text-center"
            >
              <motion.div className="text-8xl mb-4">🥁</motion.div>
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="text-3xl font-black text-white"
              >
                Les résultats arrivent...
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div
        initial={{ y: -200, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.6, type: 'spring', damping: 15 }}
        className="text-center pt-6 pb-2 relative z-10"
      >
        <motion.div
          initial={{ scale: 0, rotate: -720 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 1.8, type: 'spring', damping: 8, stiffness: 80 }}
          className="text-7xl mb-2"
        >
          <motion.span
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 10, -10, 0]
            }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
          >
            {headline.emoji}
          </motion.span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 2.2, type: 'spring', damping: 15 }}
          className="text-4xl md:text-5xl font-black text-white text-shadow-strong"
        >
          {headline.text}
        </motion.h1>
      </motion.div>

      {/* Podium */}
      <div className="flex-1 flex items-end justify-center px-4 pb-4">
        <AnimatePresence>
          {showPodium && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-end justify-center gap-4 w-full max-w-lg"
            >
              {/* Player 1 */}
              <PodiumColumn
                name={player1Name}
                score={finalResults.score1}
                isWinner={finalResults.winner === 1}
                isTie={isTie}
                isYou={playerId === 1}
                rank={finalResults.winner === 2 ? 2 : 1}
                delay={0.3}
                gender={room.player1_gender}
              />

              {/* VS */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="pb-16 text-white/30 text-2xl font-black"
              >
                VS
              </motion.div>

              {/* Player 2 */}
              <PodiumColumn
                name={player2Name}
                score={finalResults.score2}
                isWinner={finalResults.winner === 2}
                isTie={isTie}
                isYou={playerId === 2}
                rank={finalResults.winner === 1 ? 2 : 1}
                delay={0.4}
                gender={room.player2_gender}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats & Actions */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            initial={{ y: 200 }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            className="bg-white rounded-t-3xl p-4 md:p-5 max-h-[46dvh] overflow-y-auto pb-24"
          >
            <div className="max-w-lg mx-auto">
              {/* Compatibility score */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-4"
              >
                <div className="inline-flex items-center gap-3 bg-[#a3235e]/10 rounded-full px-5 py-2">
                  <span className="text-2xl">{compatMessage.emoji}</span>
                  <div className="text-left">
                    <p className="text-[#a3235e] font-black text-2xl">
                      {compatibility}%
                    </p>
                    <p className="text-gray-600 font-semibold text-xs">
                      de compatibilité
                    </p>
                  </div>
                </div>
                <p className="text-gray-500 mt-2 font-semibold text-sm">
                  {compatMessage.text}
                </p>
              </motion.div>

              {/* Gamification highlights */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap justify-center gap-2 mb-4"
              >
                {myMaxStreak >= 2 && (
                  <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 rounded-full px-3 py-1 text-sm font-bold">
                    🔥 Série max: {myMaxStreak}
                  </span>
                )}
                {mySpeedBonus > 0 && (
                  <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 rounded-full px-3 py-1 text-sm font-bold">
                    ⚡ Bonus rapidite: +{mySpeedBonus}
                  </span>
                )}
                {finalResults.perfectMatches > 0 && (
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 rounded-full px-3 py-1 text-sm font-bold">
                    🎯 Parfaits: {finalResults.perfectMatches}
                  </span>
                )}
              </motion.div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatBox
                  value={finalResults.totalQuestions}
                  label="Questions"
                  emoji="❓"
                  delay={0.1}
                />
                <StatBox
                  value={finalResults.score1 + finalResults.score2}
                  label="Points"
                  emoji="⭐"
                  delay={0.2}
                />
                <StatBox
                  value={finalResults.correctAnswers1}
                  label="Accords"
                  emoji="🤝"
                  delay={0.3}
                />
              </div>

              {/* Category breakdown */}
              {showCategories && finalResults.categoryScores && finalResults.categoryScores.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ delay: 0.2 }}
                  className="mb-4"
                >
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 text-center">
                    Compatibilité par catégorie
                  </h3>
                  <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                    {finalResults.categoryScores.slice(0, 5).map((cat, idx) => (
                      <CategoryBar key={cat.category} category={cat} delay={0.1 * idx} />
                    ))}
                  </div>
                  {bestCategory && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="text-center mt-3 text-sm text-[#a3235e] font-semibold"
                    >
                      {CATEGORY_ICONS[bestCategory.category] || '💡'} Votre force : <span className="capitalize">{bestCategory.category}</span> ({bestCategory.compatibility}%)
                    </motion.p>
                  )}
                </motion.div>
              )}

              {/* History toggle button */}
              {finalResults.questionHistory && finalResults.questionHistory.length > 0 && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full mb-4 py-3 bg-[#a3235e]/10 hover:bg-[#a3235e]/20 rounded-xl text-[#a3235e] font-bold transition-colors"
                >
                  <span className="flex items-center justify-center gap-2">
                    <span>📋</span>
                    {showHistory ? 'Masquer l\'historique' : 'Voir l\'historique des questions'}
                    <span>{showHistory ? '▲' : '▼'}</span>
                  </span>
                </motion.button>
              )}

              {/* Question history */}
              <AnimatePresence>
                {showHistory && finalResults.questionHistory && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 overflow-hidden"
                  >
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3 max-h-[40vh] overflow-y-auto">
                      {finalResults.questionHistory.map((item, idx) => (
                        <QuestionHistoryItem
                          key={idx}
                          item={item}
                          index={idx}
                          player1Name={player1Name}
                          player2Name={player2Name}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Share on WhatsApp */}
              <motion.button
                initial={{ y: 50, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                onClick={() => {
                  playSound('click');
                  const text = `🎮 Jeu Couples - Résultats\n\n` +
                    `${player1Name} vs ${player2Name}\n\n` +
                    `🏆 ${isTie ? 'Égalité !' : isWinner ? 'Tu as gagné !' : headline.text}\n\n` +
                    `📊 Score: ${finalResults.score1} - ${finalResults.score2}\n` +
                    `💕 Compatibilité: ${compatibility}%\n\n` +
                    `${compatMessage.emoji} ${compatMessage.text}\n\n` +
                    `Jouez vous aussi sur ${window.location.origin}`;
                  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
                  window.open(whatsappUrl, '_blank');
                }}
                className="w-full py-3 rounded-2xl font-bold text-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white transition-colors flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                Partager sur WhatsApp
              </motion.button>

              {/* Play again button */}
              <motion.button
                initial={{ y: 50, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                onClick={handlePlayAgain}
                className="btn-create w-full text-lg relative overflow-hidden group"
                whileHover={{ scale: 1.03, y: -3 }}
                whileTap={{ scale: 0.97 }}
              >
                {/* Button shine effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '200%' }}
                  transition={{ duration: 0.6 }}
                />
                <span className="flex items-center justify-center gap-3 relative z-10">
                  <span className="text-xl">🔄</span>
                  Rejouer
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed Reaction Bar at bottom */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8 }}
        className="fixed bottom-0 left-0 right-0 bg-black/50 backdrop-blur-md py-3 px-4 border-t border-white/20 z-50 space-y-2"
      >
        <GameChat />
        <ReactionBar />
      </motion.div>
    </div>
  );
}

// Question history item component
function QuestionHistoryItem({
  item,
  index,
  player1Name,
  player2Name
}: {
  item: QuestionHistory;
  index: number;
  player1Name: string;
  player2Name: string;
}) {
  const { question, answer1, answer2, correct, points1, points2 } = item;

  // Convert answer codes to display text
  const getDisplayAnswer = (answer: string | null) => {
    if (!answer) return 'Pas de réponse';

    // Special answers
    if (answer === 'joker') return '🃏 Joker';
    if (answer === 'dontknow') return '🤷 Je ne sais pas';

    // Type E, I, L: Convert 'A' or 'B' to actual option text
    if (question.type === 'E' || question.type === 'I' || question.type === 'L') {
      if (answer === 'A') return question.option_a || 'Option A';
      if (answer === 'B') return question.option_b || 'Option B';
    }

    // Type F: Convert 'player1' or 'player2' to player name
    if (question.type === 'F') {
      if (answer === 'player1') return player1Name;
      if (answer === 'player2') return player2Name;
      if (answer === 'both') return '👫 Nous deux';
    }

    // Type G: Capitalize vrai/faux
    if (question.type === 'G') {
      return answer.charAt(0).toUpperCase() + answer.slice(1);
    }

    // Type N: Plus/Moins
    if (question.type === 'N') {
      if (answer === 'plus') return '+ Plus';
      if (answer === 'moins') return '- Moins';
    }

    // Type S: Hot Take
    if (question.type === 'S') {
      if (answer === 'daccord') return "👍 D'accord";
      if (answer === 'pasdaccord') return "👎 Pas d'accord";
    }

    return answer;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`p-3 rounded-lg border-l-4 ${correct ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50'}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <span className="text-lg">{correct ? '✅' : '❌'}</span>
        <p className="font-semibold text-gray-800 text-sm flex-1">{question.text}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white/50 rounded p-2">
          <p className="text-gray-500 font-medium">{player1Name}</p>
          <p className="text-gray-800 font-semibold truncate">{getDisplayAnswer(answer1)}</p>
          <p className="text-[#a3235e] font-bold">+{points1} pts</p>
        </div>
        <div className="bg-white/50 rounded p-2">
          <p className="text-gray-500 font-medium">{player2Name}</p>
          <p className="text-gray-800 font-semibold truncate">{getDisplayAnswer(answer2)}</p>
          <p className="text-[#a3235e] font-bold">+{points2} pts</p>
        </div>
      </div>
    </motion.div>
  );
}

interface PodiumColumnProps {
  name: string;
  score: number;
  isWinner: boolean;
  isTie: boolean;
  isYou: boolean;
  rank: 1 | 2;
  delay: number;
  gender: Gender | null;
}

function PodiumColumn({
  name,
  score,
  isWinner,
  isTie,
  isYou,
  rank,
  delay,
  gender
}: PodiumColumnProps) {
  const height = isWinner || isTie ? 100 : 80;

  // Gender-based colors
  const getGradient = () => {
    if (isWinner || isTie) {
      return 'from-[#ffd700] via-[#ffec8b] to-[#b8860b]'; // Gold for winner
    }
    // Gender colors for non-winner
    if (gender === 'F') {
      return 'from-pink-400 via-pink-300 to-pink-500';
    }
    if (gender === 'M') {
      return 'from-blue-400 via-blue-300 to-blue-500';
    }
    return 'from-[#c0c0c0] via-[#e8e8e8] to-[#a0a0a0]';
  };

  const bgGradient = getGradient();
  const emoji = gender === 'F' ? '👩' : gender === 'M' ? '👨' : '👤';

  // Avatar gradient based on gender
  const avatarGradient = isWinner || isTie
    ? 'from-[#ffd700] to-[#ff8c00]'
    : gender === 'F'
      ? 'from-pink-400 to-pink-600'
      : gender === 'M'
        ? 'from-blue-400 to-blue-600'
        : 'from-[#9ca3af] to-[#6b7280]';

  return (
    <motion.div
      initial={{ y: 300, opacity: 0, scale: 0.5 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 12, stiffness: 100 }}
      className="flex flex-col items-center flex-1 max-w-[140px] relative"
    >
      {/* Glow effect for winner */}
      {(isWinner || isTie) && (
        <motion.div
          className="absolute -inset-4 rounded-full bg-yellow-400/20 blur-xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Crown for winner with bounce */}
      {(isWinner || isTie) && (
        <motion.div
          initial={{ y: -100, opacity: 0, scale: 0, rotate: -180 }}
          animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: delay + 0.5, type: 'spring', stiffness: 200, damping: 10 }}
          className="text-4xl mb-1 relative z-10"
        >
          <motion.span
            animate={{
              y: [0, -8, 0],
              rotate: [0, 10, -10, 0]
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            👑
          </motion.span>
        </motion.div>
      )}

      {/* Avatar with glow */}
      <motion.div
        initial={{ scale: 0, rotate: -360 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: delay + 0.2, type: 'spring', stiffness: 150 }}
        className={`
          w-16 h-16 rounded-full flex items-center justify-center text-3xl mb-1 relative z-10
          shadow-2xl border-4 bg-gradient-to-br ${avatarGradient}
          ${isWinner || isTie ? 'border-white' : 'border-white/50'}
        `}
      >
        <motion.span
          animate={(isWinner || isTie) ? {
            scale: [1, 1.1, 1]
          } : {}}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
        >
          {emoji}
        </motion.span>
      </motion.div>

      {/* Name with emphasis */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.3 }}
        className={`
          font-bold text-center mb-1 truncate w-full relative z-10 text-sm
          ${isWinner || isTie ? 'text-yellow-200' : 'text-white'}
        `}
      >
        {name}
      </motion.p>
      {isYou && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.4, type: 'spring' }}
          className="text-xs bg-white/30 text-white px-2 py-0.5 rounded-full mb-1 font-bold relative z-10"
        >
          Toi
        </motion.span>
      )}

      {/* Podium bar with dramatic rise */}
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height, opacity: 1 }}
        transition={{ delay: delay + 0.3, duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        className={`
          w-full bg-gradient-to-t ${bgGradient} rounded-t-2xl
          flex flex-col items-center justify-start pt-3 relative overflow-hidden
          shadow-2xl
        `}
      >
        {/* Animated shine sweep */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ delay: delay + 1, duration: 1, repeat: Infinity, repeatDelay: 3 }}
        />

        {/* Rank with pop effect */}
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.6, type: 'spring', stiffness: 200 }}
          className={`
            text-4xl font-black drop-shadow-lg relative z-10
            ${isWinner || isTie ? 'text-white' : 'text-white/80'}
          `}
        >
          #{rank}
        </motion.span>

        {/* Score with counter animation */}
        <motion.div
          initial={{ scale: 0, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ delay: delay + 0.8, type: 'spring', stiffness: 200 }}
          className={`
            mt-2 rounded-xl px-4 py-1 relative z-10
            ${isWinner || isTie ? 'bg-black/30' : 'bg-white/20'}
          `}
        >
          <motion.span
            className="text-2xl font-black text-white"
            animate={score > 0 ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            <AnimatedCounter value={score} duration={1500} />
          </motion.span>
          <span className="text-white/60 text-xs ml-1 font-bold">pts</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// AnimatedCounter used in PodiumColumn
function AnimatedCounter({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(interval);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value, duration]);

  return <>{count}</>;
}

interface StatBoxProps {
  value: number;
  label: string;
  emoji: string;
  delay?: number;
}

function StatBox({ value, label, emoji, delay = 0 }: StatBoxProps) {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -10 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ delay, type: 'spring', stiffness: 200, damping: 15 }}
      whileHover={{ scale: 1.05, y: -3 }}
      className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 text-center shadow-lg relative overflow-hidden"
    >
      {/* Shine effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
        initial={{ x: '-100%' }}
        animate={{ x: '200%' }}
        transition={{ delay: delay + 0.5, duration: 0.8 }}
      />
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: delay + 0.1, type: 'spring' }}
        className="text-2xl block"
      >
        {emoji}
      </motion.span>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay + 0.2 }}
        className="text-2xl font-black text-[#a3235e] mt-1"
      >
        <AnimatedCounter value={value} duration={1200} />
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.3 }}
        className="text-gray-500 text-xs font-bold uppercase tracking-wide"
      >
        {label}
      </motion.p>
    </motion.div>
  );
}
