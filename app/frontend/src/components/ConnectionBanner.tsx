import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';

/**
 * Bandeau de connexion, affiche sur TOUTES les pages.
 *
 * Il existe parce que la perte de socket etait totalement silencieuse en
 * production : le badge "Connecte" disparaissait de l'accueil, puis plus rien
 * ne repondait — aucun message, aucune erreur console, aucune tentative de
 * reconnexion. Le joueur croyait a une application figee.
 *
 * Ici l'etat est dit explicitement, et le compteur de tentatives montre que
 * quelque chose se passe. Le bandeau s'efface de lui-meme des le retour.
 */
export default function ConnectionBanner() {
  const { connected, reconnectAttempts, resumePhase } = useGame();

  // Au tout premier chargement le socket n'est pas encore etabli : afficher
  // "connexion perdue" avant meme d'avoir ete connecte serait mensonger.
  const booting = resumePhase === 'booting' || resumePhase === 'connecting';
  const show = !connected && !booting;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', damping: 22 }}
          role="status"
          aria-live="polite"
          className="fixed top-0 left-0 right-0 z-[200] bg-[#e21b3c] text-white
                     px-4 py-2 shadow-lg safe-top"
        >
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-3 text-sm font-bold">
            <motion.span
              className="w-3 h-3 rounded-full bg-white"
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
            />
            <span>Connexion perdue : reconnexion&hellip;</span>
            {reconnectAttempts > 0 && (
              <span className="font-semibold text-white/80">
                (tentative {reconnectAttempts})
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
