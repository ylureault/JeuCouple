import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';

/**
 * Escalade : la montee vers un palier plus explicite se propose, elle ne
 * s'impose plus (constat GRAVE n.4 du coach). Les DEUX joueurs disent oui,
 * sinon on reste au palier en cours — sans commentaire ni penalite.
 * Meme patron visuel que le choix de theme du duel.
 */
export default function EscaladePalierSheet() {
  const { palierRequest, myPalierVote, respondPalier } = useGame();
  const [remaining, setRemaining] = useState(0);
  const timeout = palierRequest?.timeoutSeconds ?? 0;

  useEffect(() => {
    if (!palierRequest) return;
    setRemaining(timeout);
    const id = setInterval(() => setRemaining((t) => (t <= 1 ? 0 : t - 1)), 1000);
    return () => clearInterval(id);
  }, [palierRequest, timeout]);

  return (
    <AnimatePresence>
      {palierRequest && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[92] flex items-end sm:items-center justify-center
                     bg-black/70 backdrop-blur-sm safe-bottom"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            role="alertdialog" aria-modal="true"
            aria-label="Proposition de monter d'un palier"
            className="surface w-full sm:max-w-sm rounded-t-[28px] sm:rounded-[28px] p-6 pb-7 text-center"
          >
            <div className="sm:hidden w-10 h-1 rounded-full bg-white/25 mx-auto mb-4" aria-hidden="true" />
            <motion.span
              className="text-5xl block mb-3"
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
              aria-hidden="true"
            >
              🌡️
            </motion.span>
            <h2 className="text-white font-black text-xl mb-1">La température monte…</h2>
            <p className="text-white/75 mb-1">
              Prochain palier : {palierRequest.category.icon} <b>{palierRequest.category.name}</b>
            </p>
            <p className="text-white/60 text-xs mb-5">
              Vous devez être d'accord tous les deux. Rester sur le palier actuel est
              tout aussi bien — personne ne saura qui a dit non.
            </p>

            {myPalierVote ? (
              <p className="text-white/80 font-semibold py-3">
                ✓ C'est noté — on attend la réponse de ton/ta partenaire…
              </p>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => respondPalier(false)}
                  className="flex-1 h-12 rounded-[16px] bg-white/10 hover:bg-white/16 text-white font-bold transition-colors"
                >
                  On reste ici
                </button>
                <button
                  onClick={() => respondPalier(true)}
                  className="flex-1 h-12 rounded-[16px] font-bold text-white
                             bg-gradient-to-br from-[#f2704e] to-[#e8557f]"
                >
                  On monte 🔥
                </button>
              </div>
            )}

            <div className="mt-5">
              <div className="h-1.5 rounded-full bg-white/12 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#f0a642] to-[#f2704e]"
                  initial={{ width: '100%' }}
                  animate={{ width: `${timeout > 0 ? (remaining / timeout) * 100 : 0}%` }}
                  transition={{ ease: 'linear', duration: 1 }}
                />
              </div>
              <p className="text-white/60 text-[11px] mt-2">
                {remaining > 0 ? `${remaining} s — sans réponse, on reste au palier actuel` : 'On reste au palier actuel'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
