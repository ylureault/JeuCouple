import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import GameModeSelector from './GameModeSelector';
import { GAME_MODES, type GameMode } from '../../../shared/types';

/**
 * Changement de jeu en cours de partie.
 * Un joueur propose, l'autre valide : on ne bascule jamais le jeu de force.
 * Le nouveau mode ne s'applique qu'a la manche suivante, pour ne pas couper
 * une question deja commencee.
 */
export default function ModeSwitcher() {
  const {
    currentMode, modeProposal, modeNotice,
    proposeMode, respondToModeProposal, dismissModeNotice,
  } = useGame();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GameMode>(currentMode);
  const [sent, setSent] = useState(false);

  // La notification de changement s'efface seule : elle ne doit pas rester
  // en travers de la question suivante.
  useEffect(() => {
    if (!modeNotice) return;
    const id = setTimeout(dismissModeNotice, 4000);
    return () => clearTimeout(id);
  }, [modeNotice, dismissModeNotice]);

  // Une proposition acceptee ou refusee libere le bouton.
  useEffect(() => {
    if (modeNotice) { setSent(false); setOpen(false); }
  }, [modeNotice]);

  const send = () => {
    if (draft === currentMode) return;
    proposeMode(draft);
    setSent(true);
    setOpen(false);
  };

  const current = GAME_MODES.find((m) => m.id === currentMode);

  return (
    <>
      {/* Declencheur discret, dans la barre du haut */}
      <button
        type="button"
        onClick={() => { setDraft(currentMode); setOpen(true); }}
        disabled={sent}
        aria-label={`Jeu en cours : ${current?.label ?? currentMode}. Proposer un autre jeu`}
        className="flex items-center gap-1 px-2 h-11 rounded-full text-white/75
                   hover:text-white hover:bg-white/10 transition-colors
                   disabled:opacity-45 disabled:cursor-not-allowed"
      >
        <span aria-hidden="true">{current?.icon ?? '🎮'}</span>
        <span className="text-[11px] font-bold hidden xs:inline">
          {sent ? 'Envoyé…' : 'Changer'}
        </span>
      </button>

      {/* Panneau de proposition */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm
                       flex items-end sm:items-center justify-center safe-bottom"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="Proposer un autre jeu"
              className="surface w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] p-5 pb-7"
            >
              <div className="sm:hidden w-10 h-1 rounded-full bg-white/25 mx-auto mb-4" aria-hidden="true" />
              <h2 className="text-white font-black text-lg mb-1">Proposer un autre jeu</h2>
              <p className="text-white/60 text-xs mb-4">
                Votre partenaire devra accepter. Le changement prend effet à la manche suivante.
              </p>

              <GameModeSelector value={draft} onChange={setDraft} variant="dark" />

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 h-12 rounded-[16px] bg-white/10 hover:bg-white/16
                             text-white font-bold transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={send}
                  disabled={draft === currentMode}
                  className="flex-1 h-12 rounded-[16px] font-bold text-white transition-opacity
                             bg-gradient-to-br from-[#f2789a] to-[#e8557f]
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Proposer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Demande recue : c'est au partenaire de trancher */}
      <AnimatePresence>
        {modeProposal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[96] bg-black/75 backdrop-blur-sm
                       flex items-end sm:items-center justify-center safe-bottom"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              role="alertdialog" aria-modal="true"
              aria-label={`${modeProposal.fromName} propose de jouer a ${modeProposal.label}`}
              className="surface w-full sm:max-w-sm rounded-t-[28px] sm:rounded-[28px] p-6 pb-7 text-center"
            >
              <span className="text-5xl block mb-3" aria-hidden="true">{modeProposal.icon}</span>
              <h2 className="text-white font-black text-xl mb-1">
                {modeProposal.fromName} propose
              </h2>
              <p className="text-white/75 mb-1">{modeProposal.label}</p>
              <p className="text-white/50 text-xs mb-5">
                {GAME_MODES.find((m) => m.id === modeProposal.mode)?.description}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => respondToModeProposal(false)}
                  className="flex-1 h-12 rounded-[16px] bg-white/10 hover:bg-white/16
                             text-white font-bold transition-colors"
                >
                  Non merci
                </button>
                <button
                  onClick={() => respondToModeProposal(true)}
                  className="flex-1 h-12 rounded-[16px] font-bold text-white
                             bg-gradient-to-br from-[#f2789a] to-[#e8557f]"
                >
                  On y va
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation ou refus, en bandeau ephemere */}
      <AnimatePresence>
        {modeNotice && (
          <motion.div
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            role="status" aria-live="polite"
            className={`fixed left-1/2 -translate-x-1/2 z-[97] px-4 py-2 rounded-full
                        text-sm font-bold text-white shadow-lg
                        ${modeNotice.kind === 'changed'
                          ? 'bg-gradient-to-r from-[#e8557f] to-[#f0a642]'
                          : 'bg-white/20 backdrop-blur'}`}
            style={{ top: 'calc(var(--safe-t) + 56px)' }}
          >
            {modeNotice.text}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
