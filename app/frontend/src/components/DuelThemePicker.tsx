import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';

/**
 * Mode duel : entre deux manches, le gagnant choisit le theme de la suivante.
 * Ce composant couvre les deux points de vue — celui qui choisit et celui qui
 * attend — et affiche le decompte, car le serveur tranche au hasard a son terme.
 */
export default function DuelThemePicker() {
  const { duelChoice, duelWaiting, chooseDuelTheme } = useGame();
  const [remaining, setRemaining] = useState(0);

  const active = duelChoice ?? duelWaiting;
  const timeout = active?.timeoutSeconds ?? 0;

  useEffect(() => {
    if (!active) return;
    setRemaining(timeout);
    const id = setInterval(() => {
      setRemaining((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [active, timeout]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center
                     bg-black/70 backdrop-blur-sm safe-bottom"
        >
          {/* Feuille montante : geste natif sur mobile, carte centree au-dela */}
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="surface w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px]
                       p-5 pb-7 m-0 sm:m-4"
            role="dialog"
            aria-modal="true"
            aria-label="Choix du theme de la prochaine question"
          >
            {/* Poignee de feuille, purement visuelle */}
            <div className="sm:hidden w-10 h-1 rounded-full bg-white/25 mx-auto mb-4" aria-hidden="true" />

            {duelChoice ? (
              <>
                <p className="text-white/60 text-xs font-bold uppercase tracking-wide mb-1">
                  Manche {duelChoice.roundNumber}
                </p>
                <h2 className="text-white font-black text-xl mb-1">
                  Tu remportes la manche
                </h2>
                <p className="text-white/65 text-sm mb-4">
                  A toi de choisir le theme de la prochaine question.
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                  {duelChoice.options.map((opt) => (
                    <motion.button
                      key={opt.code}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => chooseDuelTheme(opt.code)}
                      aria-label={`${opt.name}, ${opt.questionCount} questions`}
                      className="rounded-[18px] p-3 text-left border border-white/15
                                 bg-white/8 hover:bg-white/14 transition-colors"
                      style={{ borderColor: `${opt.color}66` }}
                    >
                      <span className="text-2xl block leading-none mb-1.5" aria-hidden="true">
                        {opt.icon}
                      </span>
                      <span className="block text-white font-bold text-sm leading-tight break-words">
                        {opt.name}
                      </span>
                      <span className="block text-white/45 text-[11px] mt-0.5">
                        {opt.questionCount} questions
                      </span>
                    </motion.button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-2">
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 1.8 }}
                  className="text-5xl mb-3"
                  aria-hidden="true"
                >
                  ⚔️
                </motion.div>
                <h2 className="text-white font-black text-xl mb-1">
                  {duelWaiting!.chooserName} remporte la manche
                </h2>
                <p className="text-white/65 text-sm">
                  {duelWaiting!.reason === 'tiebreak'
                    ? 'Egalite : la main lui revient pour ce tour.'
                    : 'Il/elle choisit le theme de la prochaine question.'}
                </p>
              </div>
            )}

            {/* Decompte : sans lui, l'attente parait figee */}
            <div className="mt-5">
              <div className="h-1.5 rounded-full bg-white/12 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[#e8557f] to-[#f0a642]"
                  initial={{ width: '100%' }}
                  animate={{ width: `${timeout > 0 ? (remaining / timeout) * 100 : 0}%` }}
                  transition={{ ease: 'linear', duration: 1 }}
                />
              </div>
              <p className="text-white/45 text-[11px] text-center mt-2">
                {remaining > 0
                  ? `${remaining} s — sans choix, le theme est tire au sort`
                  : 'Tirage au sort en cours…'}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
