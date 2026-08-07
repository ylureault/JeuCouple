import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence, type Transition } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import { useTheme } from '../context/ThemeContext';
import MuteButton from '../components/MuteButton';
import ReactionBar from '../components/ReactionBar';
import ReactionOverlay from '../components/ReactionOverlay';
import TextReactionOverlay from '../components/TextReactionOverlay';
// Les messages lobby:chat etaient recus et stockes, mais aucune interface ne
// les affichait ni ne permettait d'en envoyer.
import LobbyChat from '../components/LobbyChat';
import SoundReactionHandler from '../components/SoundReactionHandler';
import ResumeGate from '../components/ResumeGate';
import { consulterSalon, raisonSalonIndisponible, traduireErreur } from '../lib/salon';
import type { Gender } from '../../../shared/types';

// Verdict de la consultation du salon quand on arrive sur /salon/:code sans y
// avoir sa place (lien partage, lien perime, onglet rouvert trop tard).
type VerdictSalon =
  | { etape: 'attente' }                                    // consultation en cours
  | { etape: 'inconnu' }                                    // serveur muet : on ne conclut rien
  | { etape: 'rejoignable' }                                // le salon existe et attend un 2e joueur
  | { etape: 'indisponible'; titre: string; detail: string };

/**
 * U2 — le salon mettait plusieurs secondes a se composer : chaque bloc entrait
 * avec un ressort framer-motion par defaut, et les boutons de partage puis les
 * cartes joueurs etaient decales de 200 a 300 ms chacun. Pendant ce temps
 * l'ecran reste quasi vide et les clics tombent dans le vide.
 * Duree fixe et courte, decalages divises par cinq : tout est en place en
 * moins de 250 ms, et cliquable des le premier frame.
 */
const ENTREE: Transition = { duration: 0.16, ease: [0.16, 1, 0.3, 1] };
const decalage = (secondes: number): Transition => ({ ...ENTREE, delay: secondes });

export default function Lobby() {
  const {
    room,
    playerId,
    startGame,
    leaveRoom,
    phase,
    error,
    gameSettings,
    acceptSettings,
    resumePhase
  } = useGame();
  const { playSound, playLobbyMusic, stopLobbyMusic } = useAudio();
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const [copied, setCopied] = useState(false);
  const [verdict, setVerdict] = useState<VerdictSalon>({ etape: 'attente' });
  // E10 : accord du partenaire sur les reglages. Jusqu'ici la ligne "en attente
  // que X valide" disparaissait et le bouton s'activait, sans le moindre signal :
  // l'hote pouvait fixer l'ecran sans voir que c'etait bon.
  const [accordToast, setAccordToast] = useState(false);
  const accepteRef = useRef(false);

  // Navigate to game when it starts (with room code in URL)
  // Ambiance d'attente : tout le systeme musical existait mais n'etait
  // appele nulle part, le jeu se jouait en silence.
  useEffect(() => {
    playLobbyMusic();
    return () => stopLobbyMusic();
  }, [playLobbyMusic, stopLobbyMusic]);

  useEffect(() => {
    if (phase === 'question' && room?.code) {
      navigate(`/game/${room.code}`);
    }
  }, [phase, navigate, room?.code]);

  // E10 — l'accord du partenaire se voit ET s'entend. On ne declenche que sur
  // la BASCULE false -> true : une simple rediffusion des reglages ne doit pas
  // resonner une seconde fois.
  useEffect(() => {
    const accepte = !!gameSettings?.settingsAccepted;
    if (accepte && !accepteRef.current) {
      playSound('notification');
      setAccordToast(true);
      const id = setTimeout(() => setAccordToast(false), 4000);
      accepteRef.current = accepte;
      return () => clearTimeout(id);
    }
    accepteRef.current = accepte;
  }, [gameSettings?.settingsAccepted, playSound]);

  // If no room and no valid code in URL, go home
  useEffect(() => {
    if (!room && !code) {
      navigate('/');
    }
  }, [room, code, navigate]);

  /**
   * B7 — /salon/:code ouvert sans avoir sa place dans ce salon.
   *
   * Cas reel : un lien partage, rouvert apres expiration. Il n'y a rien a
   * restaurer, la reprise se termine donc sans rien faire et l'ecran restait
   * noir, sans un mot, sans une erreur console. On demande maintenant au
   * serveur ce que vaut ce code, et on le dit.
   */
  useEffect(() => {
    if (room || !code) return;
    let annule = false;
    setVerdict({ etape: 'attente' });
    consulterSalon(code).then((etat) => {
      if (annule) return;
      if (!etat) {
        // Serveur injoignable : surtout ne pas annoncer une disparition dont
        // on n'a aucune preuve.
        setVerdict({ etape: 'inconnu' });
        return;
      }
      if (etat.joinable) {
        setVerdict({ etape: 'rejoignable' });
        return;
      }
      setVerdict({ etape: 'indisponible', ...raisonSalonIndisponible(etat) });
    });
    return () => { annule = true; };
  }, [room, code]);

  // Le salon existe et attend un partenaire, mais nous n'y avons pas de place :
  // on envoie le joueur sur l'ecran Rejoindre, code deja saisi.
  useEffect(() => {
    if (room || !code) return;
    if (verdict.etape !== 'rejoignable') return;
    if (resumePhase === 'restoring') return;   // une reprise est en vol, on la laisse finir
    navigate('/', { state: { joinCode: code } });
  }, [room, code, verdict, resumePhase, navigate]);

  const handleStart = async () => {
    playSound('click');
    try {
      await startGame();
    } catch {
      // Error handled in context
    }
  };

  const handleLeave = () => {
    playSound('click');
    leaveRoom();
    navigate('/');
  };

  const copyCode = () => {
    if (room?.code) {
      navigator.clipboard.writeText(room.code);
      playSound('click');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareLink = () => {
    if (room?.code) {
      const url = `${window.location.origin}/join/${room.code}`;

      // Try native share API first (mobile)
      if (navigator.share) {
        navigator.share({
          title: 'Jeu Couples',
          text: `Rejoins-moi pour jouer ! 💕`,
          url: url
        }).catch(() => {
          // Fallback to clipboard
          navigator.clipboard.writeText(url);
        });
      } else {
        // Desktop fallback - copy link
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      playSound('click');
    }
  };

  const shareWhatsApp = () => {
    if (room?.code) {
      const url = `${window.location.origin}/join/${room.code}`;
      const text = `Rejoins-moi pour jouer au Jeu Couples ! 💕\n\n${url}`;
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank');
      playSound('click');
    }
  };

  const { theme } = useTheme();

  // Un `return null` laissait une page blanche quand la reprise de session
  // echouait sur /salon/:code : on montre desormais l'attente ou le motif.
  if (!room) {
    // Le serveur a tranche : ce salon ne peut pas nous accueillir. Ce verdict
    // prime sur la machine de reprise — s'il n'y a plus de partie, il n'y a
    // rien a reprendre, et il n'y a aucune raison de faire tourner un spinner.
    if (verdict.etape === 'indisponible') {
      return <SalonIndisponible titre={verdict.titre} detail={verdict.detail} />;
    }
    return <ResumeGate />;
  }

  const isHost = playerId === 1;
  // Un prenom vide ou fait d'espaces ne vaut pas une presence : la condition
  // est explicitement booleenne pour qu'aucune chaine vide ne se glisse dans
  // l'affichage.
  const player1Present = !!room.player1_name?.trim();
  const player2Present = !!room.player2_name?.trim();
  const bothPlayersReady = player1Present && player2Present;

  return (
    <div className={`min-h-[100dvh] bg-gradient-to-br ${theme.colors.background} flex flex-col overflow-x-hidden pb-16`}>
      <MuteButton />
      <ReactionOverlay />
      <TextReactionOverlay />
      <SoundReactionHandler />
      <LobbyChat />

      {/* E10 : petit bandeau d'accord, en haut, non bloquant. */}
      <AnimatePresence>
        {accordToast && (
          <motion.div
            key="accord"
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            role="status"
            data-test="toast-accord"
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2
                       rounded-full bg-[#26890c] px-5 py-2.5 shadow-xl"
          >
            <span aria-hidden="true" className="text-lg">✅</span>
            <span className="text-white font-bold text-sm">
              {playerId === 1
                ? `${room?.player2_name || 'Ton partenaire'} a validé les réglages !`
                : 'Réglages validés — la partie peut démarrer'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice chat - top right */}
      <div className="fixed top-4 right-16 z-50 flex items-center gap-2">
      </div>

      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute inset-0"
          animate={{
            background: [
              'radial-gradient(circle at 20% 50%, rgba(123, 44, 191, 0.3) 0%, transparent 50%)',
              'radial-gradient(circle at 80% 50%, rgba(123, 44, 191, 0.3) 0%, transparent 50%)',
              'radial-gradient(circle at 20% 50%, rgba(123, 44, 191, 0.3) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={ENTREE}
          className="text-center mb-4"
        >
          <p className="text-white/60 font-semibold uppercase tracking-wider mb-2">
            Code du salon
          </p>
          <motion.div
            onClick={copyCode}
            className="cursor-pointer group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="bg-white rounded-xl px-8 py-4 shadow-2xl relative overflow-hidden">
              <motion.div
                className="absolute inset-0 bg-[#26890c]"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: copied ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                style={{ transformOrigin: 'left' }}
              />
              <p className="text-4xl md:text-5xl font-black tracking-[0.2em] text-[#a3235e] relative z-10">
                {copied ? '✓' : room.code}
              </p>
            </div>
            <p className="text-white/50 text-sm mt-3 group-hover:text-white/70 transition-colors">
              {copied ? 'Code copié !' : 'Clique pour copier'}
            </p>
          </motion.div>

          {/* Share buttons */}
          <div className="flex gap-2 mt-3 flex-wrap justify-center">
            <motion.button
              onClick={shareLink}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={decalage(0.03)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white font-bold px-4 py-2 rounded-full transition-colors text-sm"
            >
              <span>🔗</span>
              Copier
            </motion.button>

            <motion.button
              onClick={shareWhatsApp}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={decalage(0.06)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold px-4 py-2 rounded-full transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              WhatsApp
            </motion.button>
          </div>
        </motion.div>

        {/* Players */}
        <div className="w-full max-w-lg md:max-w-2xl space-y-3 mb-4">
          <motion.div
            initial={{ x: -14, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={decalage(0.02)}
          >
            <PlayerCard
              name={room.player1_name}
              gender={room.player1_gender}
              isYou={playerId === 1}
              isReady={player1Present}
              position={1}
            />
          </motion.div>

          {/* VS separator */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={decalage(0.05)}
            className="flex items-center justify-center"
          >
            <div className="w-16 h-16 rounded-full bg-[#e21b3c] flex items-center justify-center shadow-lg">
              <span className="text-2xl font-black text-white">VS</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ x: 14, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={decalage(0.08)}
          >
            <PlayerCard
              name={room.player2_name}
              gender={room.player2_gender}
              isYou={playerId === 2}
              isReady={player2Present}
              position={2}
            />
          </motion.div>
        </div>

        {/* Status / Actions */}
        {/* `mode="wait"` etait faux ici : AnimatePresence n'attend qu'UN enfant
            a la fois. Avec plusieurs blocs simultanes (recap, attente, bouton),
            un enfant sortant pouvait rester monte indefiniment — d'ou le
            "En attente de ton partenaire..." qui survivait a l'arrivee du
            partenaire. Chaque bloc s'anime desormais pour son compte. */}
        <AnimatePresence>
          {gameSettings && (
            <motion.div
              key="recap"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={ENTREE}
              className="w-full max-w-md md:max-w-lg surface rounded-[20px] p-4 mb-4"
            >
              <p className="text-white/55 text-[11px] font-bold uppercase tracking-wide mb-2">
                Ce qui vous attend
              </p>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl" aria-hidden="true">{gameSettings.modeIcon}</span>
                <span className="text-white font-bold">{gameSettings.modeLabel}</span>
                <span className="ml-auto text-white/70 text-sm font-semibold">
                  {gameSettings.endless ? 'Sans fin' : `${gameSettings.questionCount === 50 ? '∞' : gameSettings.questionCount} questions`}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {gameSettings.categories.length === 0 ? (
                  <span className="text-[12px] px-2 py-0.5 rounded-full bg-white/12 text-white/80">
                    🎲 Tous les thèmes
                  </span>
                ) : (
                  gameSettings.categories.map((c) => (
                    <span key={c.code} className="text-[12px] px-2 py-0.5 rounded-full bg-white/12 text-white/85">
                      {c.icon} {c.name}
                    </span>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {!bothPlayersReady && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={ENTREE}
              className="text-center"
            >
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className="spinner w-6 h-6" />
                <span className="text-white font-semibold text-lg">
                  En attente de ton partenaire
                  <span className="waiting-dot">.</span>
                  <span className="waiting-dot">.</span>
                  <span className="waiting-dot">.</span>
                </span>
              </div>
              <p className="text-white/60">
                Partage le code <span className="font-mono font-bold text-white">{room.code}</span>
              </p>
            </motion.div>
          )}

          {isHost && bothPlayersReady && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={ENTREE}
              className="w-full max-w-md md:max-w-lg"
            >
              <motion.button
                onClick={handleStart}
                disabled={!!gameSettings && !gameSettings.settingsAccepted}
                className={`btn-start w-full ${gameSettings && !gameSettings.settingsAccepted ? 'opacity-50 cursor-not-allowed' : ''}`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                animate={{
                  boxShadow: [
                    '0 4px 0 0 rgba(0,0,0,0.3)',
                    '0 4px 30px 10px rgba(38, 137, 12, 0.4)',
                    '0 4px 0 0 rgba(0,0,0,0.3)',
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-3xl">🚀</span>
                  Lancer la partie !
                </span>
              </motion.button>
              {gameSettings && !gameSettings.settingsAccepted && (
                <p className="text-white/60 text-sm text-center mt-2">
                  En attente que {room.player2_name} valide les réglages…
                </p>
              )}
            </motion.div>
          )}

          {!isHost && bothPlayersReady && gameSettings && !gameSettings.settingsAccepted && (
            <motion.div
              key="accept"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={ENTREE}
              className="w-full max-w-md md:max-w-lg"
            >
              <motion.button
                onClick={() => { playSound('click'); acceptSettings(); }}
                className="btn-create w-full"
                whileTap={{ scale: 0.97 }}
              >
                ✓ Ça me va, on joue !
              </motion.button>
              <p className="text-white/55 text-xs text-center mt-2">
                {room.player1_name} a choisi ces réglages — la partie ne démarre qu'avec ton accord.
              </p>
            </motion.div>
          )}

          {!isHost && bothPlayersReady && (!gameSettings || gameSettings.settingsAccepted) && (
            <motion.div
              key="waiting-host"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={ENTREE}
              className="flex items-center gap-3 bg-white/10 rounded-xl px-6 py-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="text-2xl"
              >
                ⏳
              </motion.div>
              <span className="text-white font-semibold">
                {room.player1_name} va lancer la partie...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#e21b3c] rounded-xl px-6 py-3 mt-4"
            role="alert"
          >
            <p className="text-white font-bold">{traduireErreur(error)}</p>
          </motion.div>
        )}

        {/* Leave button */}
        <motion.button
          onClick={handleLeave}
          className="mt-4 text-white/50 hover:text-white font-semibold text-sm transition-colors"
          whileHover={{ scale: 1.05 }}
        >
          ← Quitter le salon
        </motion.button>
      </div>

      {/* Fixed Reaction Bar at bottom */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={ENTREE}
        className="fixed bottom-0 left-0 right-0 bg-black/40 backdrop-blur-sm py-2 px-2 border-t border-white/10 z-40 space-y-1.5"
      >
        <ReactionBar />
      </motion.div>
    </div>
  );
}

/**
 * Ecran affiche quand /salon/:code ne mene nulle part.
 *
 * Il remplace la page noire et muette de la recette (B7) : un lien partage
 * ouvert trop tard doit dire ce qui s'est passe et proposer une sortie.
 */
function SalonIndisponible({ titre, detail }: { titre: string; detail: string }) {
  const navigate = useNavigate();
  const { resetGame } = useGame();

  return (
    <div className="min-h-[100dvh] bg-[#180512] flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="text-6xl mb-6">🕳️</div>
        <h1 className="text-2xl font-black text-white mb-3">{titre}</h1>
        <p className="text-white/70 mb-8">{detail}</p>
        <button
          onClick={() => {
            resetGame();
            navigate('/');
          }}
          className="w-full py-4 rounded-2xl bg-pink-500 hover:bg-pink-400 transition-colors
                     text-white font-bold text-lg"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    </div>
  );
}

interface PlayerCardProps {
  name: string | null;
  gender: Gender | null;
  isYou: boolean;
  isReady: boolean;
  position: 1 | 2;
}

function PlayerCard({ name, gender, isYou, isReady, position }: PlayerCardProps) {
  // Gender-based colors
  const getGenderColors = () => {
    if (!isReady || !gender) {
      return {
        bg: 'bg-white/10 border-2 border-dashed border-white/30',
        avatarBg: 'bg-white/10',
        glow: ''
      };
    }
    if (gender === 'F') {
      return {
        bg: 'bg-gradient-to-r from-pink-500 to-pink-600 shadow-lg',
        avatarBg: 'bg-white/20',
        glow: 'shadow-[0_0_20px_rgba(236,72,153,0.5)]'
      };
    }
    return {
      bg: 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg',
      avatarBg: 'bg-white/20',
      glow: 'shadow-[0_0_20px_rgba(59,130,246,0.5)]'
    };
  };

  const colors = getGenderColors();
  const emoji = gender === 'F' ? '👩' : gender === 'M' ? '👨' : '❓';

  return (
    <motion.div
      className={`relative rounded-xl p-4 transition-all duration-300 ${colors.bg} ${colors.glow}`}
      animate={isReady ? {} : { borderColor: ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.3)'] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <motion.div
          className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${colors.avatarBg}`}
          animate={isReady ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.5 }}
        >
          {isReady ? emoji : '❓'}
        </motion.div>

        {/* Info */}
        <div className="flex-1">
          <p className="text-white/60 text-sm font-semibold uppercase tracking-wide">
            Joueur {position}
          </p>
          <p className="text-white text-xl font-bold">
            {name || 'En attente...'}
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          {isYou && (
            <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-bold">
              Toi
            </span>
          )}
          {isReady && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center"
            >
              <span className={gender === 'F' ? 'text-pink-500 text-xl' : 'text-blue-500 text-xl'}>✓</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Waiting animation */}
      {!isReady && (
        <motion.div
          className="absolute bottom-2 right-4 flex gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-white/50 rounded-full"
              animate={{ y: [0, -8, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
