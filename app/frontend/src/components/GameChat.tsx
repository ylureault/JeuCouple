import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';

/**
 * Chat de partie, toujours visible et sans scroll de page.
 * Il remplace les reactions toutes faites ("P'tit con", "Vieille peau"...) par
 * un vrai echange libre. Les reactions emoji restent a cote : elles marchent
 * bien et servent a autre chose (reagir vite sans quitter la question des yeux).
 *
 * E7 de la recette — trois defauts corriges ici :
 *
 *  1. ATTRIBUTION. Le nom affiche etait le `playerName` du message, sans jamais
 *     le confronter a l'identite du lecteur : le moindre decalage de noms (ou un
 *     nom identique des deux cotes) faisait lire son propre message sous le nom
 *     de l'autre. On tranche desormais sur `playerId`, qui vient du serveur et
 *     ne ment pas : mes messages sont marques "Toi", les autres portent le nom
 *     du partenaire. La couleur suit la meme source.
 *  2. RECEPTION. Les messages arrivaient dans le state mais rien ne le signalait
 *     quand l'historique etait replie : au-dela de deux messages, l'apercu
 *     poussait les precedents hors de vue sans un bruit. Un compteur de non-lus
 *     et un son signalent maintenant l'arrivee.
 *  3. CHAMP DE SAISIE. Le formulaire est rendu inconditionnellement, en dehors
 *     de toute animation de pliage : plus aucun ecran ne peut le faire
 *     disparaitre.
 */
const MAX_LEN = 200;
const PREVIEW_COUNT = 2;

export default function GameChat() {
  const { chatMessages, sendChatMessage, playerId, room } = useGame();
  const { playSound } = useAudio();
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Nombre de messages deja vus : sert au compteur de non-lus et au son.
  const vusRef = useRef(0);
  const [nonLus, setNonLus] = useState(0);

  // Doublons possibles si le serveur rediffuse (reconnexion) : on filtre par id,
  // sinon un message pouvait s'afficher deux fois sous deux couleurs.
  const messages = useMemo(() => {
    const vus = new Set<string>();
    return chatMessages.filter((m) => (vus.has(m.id) ? false : (vus.add(m.id), true)));
  }, [chatMessages]);

  const preview = messages.slice(-PREVIEW_COUNT);

  const nomPartenaire =
    (playerId === 1 ? room?.player2_name : room?.player1_name) || 'Ton partenaire';

  // Arrivee d'un message du partenaire : son + compteur tant que c'est replie.
  useEffect(() => {
    if (messages.length <= vusRef.current) {
      vusRef.current = messages.length;
      return;
    }
    const nouveaux = messages.slice(vusRef.current);
    vusRef.current = messages.length;
    if (nouveaux.some((m) => m.playerId !== playerId)) {
      playSound('notification');
      if (!expanded) setNonLus((n) => n + nouveaux.filter((m) => m.playerId !== playerId).length);
    }
  }, [messages, playerId, expanded, playSound]);

  useEffect(() => {
    if (expanded) {
      setNonLus(0);
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, expanded]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendChatMessage(text);
    setDraft('');
  };

  /** Etiquette d'auteur : l'identifiant serveur fait foi, jamais le nom. */
  const auteur = (msgPlayerId: 1 | 2, nomServeur: string) =>
    msgPlayerId === playerId ? 'Toi' : nomServeur || nomPartenaire;

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
            {messages.length === 0 ? (
              <p className="text-white/35 text-xs text-center py-6">
                Aucun message. Écrivez-vous pendant la partie.
              </p>
            ) : (
              messages.map((m) => (
                <p
                  key={m.id}
                  className="text-[13px] leading-snug mb-1 break-words"
                  data-test="chat-message"
                  data-auteur={auteur(m.playerId, m.playerName)}
                >
                  <span className={m.playerId === playerId ? 'text-[#f2789a] font-bold' : 'text-[#f0a642] font-bold'}>
                    {auteur(m.playerId, m.playerName)}
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
              data-test="chat-message"
              data-auteur={auteur(m.playerId, m.playerName)}
            >
              <span className={m.playerId === playerId ? 'text-[#f2789a] font-bold' : 'text-[#f0a642] font-bold'}>
                {auteur(m.playerId, m.playerName)}
              </span>
              <span className="text-white/85"> {m.message}</span>
            </motion.p>
          ))}
        </div>
      )}

      {/* Le formulaire est HORS de toute animation de pliage : aucun ecran ne
          peut le faire disparaitre. */}
      <form onSubmit={submit} className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Replier l'historique du chat" : "Afficher l'historique du chat"}
          aria-expanded={expanded}
          className="relative shrink-0 w-11 h-11 rounded-full bg-white/10 hover:bg-white/18
                     flex items-center justify-center text-white/80 transition-colors"
        >
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} aria-hidden="true">▲</motion.span>
          {nonLus > 0 && !expanded && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full
                         bg-[#e8557f] text-white text-[10px] font-black flex items-center justify-center"
              aria-label={`${nonLus} message(s) non lu(s)`}
            >
              {nonLus > 9 ? '9+' : nonLus}
            </span>
          )}
        </button>

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          placeholder={`Écrire à ${nomPartenaire}…`}
          aria-label="Message à envoyer à votre partenaire"
          data-test="chat-saisie"
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
          data-test="chat-envoyer"
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
