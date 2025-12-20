import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AlertMessage {
  id: string;
  text: string;
  emoji: string;
  type: 'info' | 'warning' | 'success' | 'motivate';
}

interface GameAlertsProps {
  otherAnswered: boolean;
  myAnswer: string | null;
  myScore: number;
  theirScore: number;
  theirName: string;
  questionNumber: number;
}

export default function GameAlerts({
  otherAnswered,
  myAnswer,
  myScore,
  theirScore,
  theirName,
  questionNumber
}: GameAlertsProps) {
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  const [lastScoreDiff, setLastScoreDiff] = useState(0);
  const [lastOtherAnswered, setLastOtherAnswered] = useState(false);
  const [lastQuestionNumber, setLastQuestionNumber] = useState(0);

  const addAlert = (text: string, emoji: string, type: AlertMessage['type']) => {
    const id = `${Date.now()}-${Math.random()}`;
    setAlerts(prev => [...prev.slice(-2), { id, text, emoji, type }]); // Keep max 3 alerts

    // Remove after 3 seconds
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }, 3000);
  };

  // Alert when other player answers first
  useEffect(() => {
    if (otherAnswered && !lastOtherAnswered && !myAnswer) {
      const messages = [
        `${theirName} vient de répondre... et toi ?! 🤔`,
        `${theirName} a été plus rapide ! Dépêche-toi !`,
        `Tic tac... ${theirName} attend ta réponse !`,
        `${theirName} est déjà prêt(e), à ton tour !`
      ];
      addAlert(messages[Math.floor(Math.random() * messages.length)], '⚡', 'warning');
    }
    setLastOtherAnswered(otherAnswered);
  }, [otherAnswered, myAnswer, theirName]);

  // Score difference alerts
  useEffect(() => {
    const scoreDiff = myScore - theirScore;

    // Check if someone just took the lead
    if (lastQuestionNumber !== questionNumber && questionNumber > 1) {
      // Other player took the lead
      if (scoreDiff < 0 && lastScoreDiff >= 0) {
        const messages = [
          `${theirName} passe devant ! Tu vas te laisser faire ? 💪`,
          `Attention ! ${theirName} prend la tête !`,
          `${theirName} te dépasse ! Réveille-toi !`
        ];
        addAlert(messages[Math.floor(Math.random() * messages.length)], '🚨', 'warning');
      }

      // You took the lead
      if (scoreDiff > 0 && lastScoreDiff <= 0) {
        const messages = [
          `Tu passes en tête ! Continue comme ça ! 🔥`,
          `Bravo ! Tu mènes la danse ! 💃`,
          `En tête ! Ne relâche pas la pression !`
        ];
        addAlert(messages[Math.floor(Math.random() * messages.length)], '🏆', 'success');
      }

      // Losing by a lot
      if (scoreDiff < -100) {
        const messages = [
          `Allez allez, tu es à la traîne ! Bouge-toi ! 🏃`,
          `Tu peux faire mieux que ça ! En route !`,
          `C\'est pas fini ! Rattrape ton retard !`
        ];
        if (Math.random() > 0.7) { // Only sometimes to avoid spam
          addAlert(messages[Math.floor(Math.random() * messages.length)], '💨', 'motivate');
        }
      }

      // Winning by a lot
      if (scoreDiff > 100) {
        const messages = [
          `Tu écrases ! Continue ! 🔥`,
          `Domination totale ! 👑`,
          `Inarrêtable ! 🚀`
        ];
        if (Math.random() > 0.7) {
          addAlert(messages[Math.floor(Math.random() * messages.length)], '🎯', 'success');
        }
      }
    }

    setLastScoreDiff(scoreDiff);
    setLastQuestionNumber(questionNumber);
  }, [myScore, theirScore, theirName, questionNumber]);

  // Random motivational alerts during game
  useEffect(() => {
    if (questionNumber > 0 && questionNumber % 5 === 0) {
      const messages = [
        `Question ${questionNumber} ! On continue sur cette lancée !`,
        `Mi-parcours ? Non, on ne lâche rien !`,
        `${questionNumber} questions ! Vous êtes incroyables ! 💕`
      ];
      setTimeout(() => {
        addAlert(messages[Math.floor(Math.random() * messages.length)], '🎮', 'info');
      }, 1500);
    }
  }, [questionNumber]);

  const getAlertStyle = (type: AlertMessage['type']) => {
    switch (type) {
      case 'warning':
        return 'from-orange-500 to-red-500 border-orange-300';
      case 'success':
        return 'from-green-500 to-emerald-600 border-green-300';
      case 'motivate':
        return 'from-purple-500 to-pink-500 border-purple-300';
      default:
        return 'from-blue-500 to-indigo-600 border-blue-300';
    }
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: -50, scale: 0.8, rotateX: -90 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: -20, scale: 0.8, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className={`
              bg-gradient-to-r ${getAlertStyle(alert.type)}
              px-6 py-3 rounded-full shadow-2xl border-2
              flex items-center gap-3
            `}
          >
            <motion.span
              animate={{
                scale: [1, 1.3, 1],
                rotate: [0, 10, -10, 0]
              }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
              className="text-2xl"
            >
              {alert.emoji}
            </motion.span>
            <span className="text-white font-bold text-sm md:text-base whitespace-nowrap">
              {alert.text}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
