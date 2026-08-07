import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';

/**
 * Chat de partie, toujours visible et sans scroll de page.
 * Il remplace les reactions toutes faites ("P'tit con", "Vieille peau"...) par
 * un vrai echange libre. Les reactions emoji restent a cote : elles marchent
 * bien et servent a autre chose (reagir vite sans quitter la question des yeux).
 *
 * Contrainte de place : on n'affiche que les deux derniers messages au-dessus
 * du champ, le reste se deroule dans une feuille depliable.
 */
const MAX_LEN = 200;
const PREVIEW_COUNT = 2;

export default function GameChat() {
  const { chatMessages, sendChatMessage, playerId } = useGame();
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const preview = chatMessages.slice(-PREVIEW_COUNT);

  useEffect(() => {
    if (expanded) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, expanded]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendChatMessage(text);
    setDraft('');
  };

  return (
    <div className="w-full">
      {/* Historique complet, replie par defaut pour ne pas manger l'ecran */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 168, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="overflow-y-auto mb-1.5 rounded-[14px] bg-black/25 px-2.5 py-2"
          >
            {chatMessages.length === 0 ? (
              <p className="text-white/35 text-xs text-center py-6">
                Aucun message. Écrivez-vous pendant la partie.
              </p>
            ) : (
              chatMessages.map((m) => (
                <p key={m.id} className="text-[13px] leading-snug mb-1 break-words">
                  <span className={m.playerId === playerId ? 'text-[#f2789a] font-bold' : 'text-[#f0a642] font-bold'}>
                    {m.playerName}
                  </span>
                  <span className="text-white/85"> {m.message}</span>
                </p>
              ))
            )}
            <div ref={endRef} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Apercu des derniers messages quand l'historique est replie */}
      {!expanded && preview.length > 0 && (
        <div className="mb-1.5 px-1 space-y-0.5">
          {preview.map((m) => (
            <motion.p
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[13px] leading-snug truncate"
            >
              <span className={m.playerId === playerId ? 'text-[#f2789a] font-bold' : 'text-[#f0a642] font-bold'}>
                {m.playerName}
              </span>
              <span className="text-white/85"> {m.message}</span>
            </motion.p>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Replier l'historique du chat" : "Afficher l'historique du chat"}
          aria-expanded={expanded}
          className="shrink-0 w-11 h-11 rounded-full bg-white/10 hover:bg-white/18
                     flex items-center justify-center text-white/80 transition-colors"
        >
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} aria-hidden="true">▲</motion.span>
        </button>

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          placeholder="Écrire un message…"
          aria-label="Message à envoyer à votre partenaire"
          enterKeyHint="send"
          className="flex-1 min-w-0 h-11 rounded-full px-4 text-white placeholder-white/60
                     bg-white/10 border border-white/15 focus:border-[#f2789a]
                     focus:bg-white/14 outline-none transition-colors"
          style={{ fontSize: 16 }}  /* 16px : en dessous, iOS zoome a la mise au point */
        />

        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Envoyer le message"
          className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center
                     bg-gradient-to-br from-[#f2789a] to-[#e8557f] text-white
                     disabled:opacity-35 disabled:cursor-not-allowed transition-opacity"
        >
          <span aria-hidden="true">➤</span>
        </button>
      </form>
    </div>
  );
}
