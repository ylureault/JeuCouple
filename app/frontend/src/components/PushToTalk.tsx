import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

/**
 * Talkie-walkie.
 *
 * Le chat vocal existant ouvrait le micro en continu, ce qui est inconfortable
 * dans un jeu de couple : on s'entend respirer, on oublie qu'on est capte.
 * Ici le micro est ferme au repos et ne s'ouvre que tant que le bouton est
 * maintenu, avec un bip de prise et de fin de parole comme sur un vrai poste.
 *
 * Le flux audio passe en pair a pair (WebRTC) ; le serveur ne relaie que
 * l'indication "je parle", pour l'affichage et le bip cote partenaire.
 */
export default function PushToTalk() {
  const { socket, playerId, room } = useGame();
  const { playSound } = useAudio();

  const [ready, setReady] = useState(false);         // micro autorise
  const [speaking, setSpeaking] = useState(false);   // je transmets
  const [peerSpeaking, setPeerSpeaking] = useState(false);
  const [denied, setDenied] = useState(false);
  const [level, setLevel] = useState(0);             // niveau du micro, 0..1

  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const partnerName = (playerId === 1 ? room?.player2_name : room?.player1_name) || 'Ton/ta partenaire';

  /** Coupe la piste micro sans fermer la connexion : reprise instantanee. */
  const setTrackEnabled = useCallback((on: boolean) => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = on; });
  }, []);

  // Demande du micro, une seule fois, a la premiere prise de parole.
  const ensureMic = useCallback(async () => {
    if (streamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,   // sans cela, chacun se reentend via l'autre
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      // Micro coupe des l'obtention : on ne transmet que sur appui.
      stream.getAudioTracks().forEach((t) => { t.enabled = false; });
      streamRef.current = stream;

      // Mesure du niveau, pour montrer que la voix passe vraiment.
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      // Connexion pair a pair, etablie une seule fois. La piste est deja
      // coupee : le lien reste ouvert, seul le flux est interrompu au repos,
      // ce qui rend la reprise instantanee a chaque appui.
      if (!pcRef.current && socket) {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('voice:ice-candidate', {
              candidate: e.candidate.candidate,
              sdpMLineIndex: e.candidate.sdpMLineIndex,
              sdpMid: e.candidate.sdpMid,
            });
          }
        };
        pc.ontrack = (e) => {
          if (remoteAudioRef.current && e.streams[0]) {
            remoteAudioRef.current.srcObject = e.streams[0];
          }
        };

        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        // Le joueur 1 emet l'offre : sans role fixe, les deux offriraient en
        // meme temps et la negociation echouerait.
        if (playerId === 1) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('voice:offer', { sdp: offer.sdp!, type: 'offer' });
        }
      }

      setReady(true);
      setDenied(false);
      return true;
    } catch {
      // Micro refuse ou indisponible : on le dit au lieu d'echouer en silence.
      setDenied(true);
      return false;
    }
  }, [socket, playerId]);

  // Boucle de mesure du niveau, active uniquement pendant la parole.
  useEffect(() => {
    if (!speaking || !analyserRef.current) { setLevel(0); return; }
    const analyser = analyserRef.current;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
      setLevel(Math.min(1, peak / 60));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [speaking]);

  const startTalking = useCallback(async () => {
    if (speaking) return;
    const ok = await ensureMic();
    if (!ok) return;
    setTrackEnabled(true);
    setSpeaking(true);
    playSound('pttStart');
    socket?.emit('voice:ptt', { speaking: true });
  }, [speaking, ensureMic, setTrackEnabled, playSound, socket]);

  const stopTalking = useCallback(() => {
    if (!speaking) return;
    setTrackEnabled(false);
    setSpeaking(false);
    playSound('pttEnd');
    socket?.emit('voice:ptt', { speaking: false });
  }, [speaking, setTrackEnabled, playSound, socket]);

  // Signalisation WebRTC. Le partenaire peut ouvrir le micro avant nous :
  // on repond alors a son offre en creant la connexion a la volee.
  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (data: { sdp: string; type: 'offer' }) => {
      const ok = await ensureMic();
      if (!ok || !pcRef.current) return;
      const pc = pcRef.current;
      await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      for (const c of pendingIceRef.current) await pc.addIceCandidate(c).catch(() => {});
      pendingIceRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice:answer', { sdp: answer.sdp!, type: 'answer' });
    };

    const handleAnswer = async (data: { sdp: string; type: 'answer' }) => {
      const pc = pcRef.current;
      if (!pc || pc.signalingState === 'stable') return;
      await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      for (const c of pendingIceRef.current) await pc.addIceCandidate(c).catch(() => {});
      pendingIceRef.current = [];
    };

    const handleIce = async (data: RTCIceCandidateInit) => {
      const pc = pcRef.current;
      // Candidat recu avant la description distante : on le met de cote,
      // l'ajouter tout de suite leverait une erreur.
      if (!pc || !pc.remoteDescription) { pendingIceRef.current.push(data); return; }
      await pc.addIceCandidate(data).catch(() => {});
    };

    socket.on('voice:offer', handleOffer);
    socket.on('voice:answer', handleAnswer);
    socket.on('voice:ice-candidate', handleIce);
    return () => {
      socket.off('voice:offer', handleOffer);
      socket.off('voice:answer', handleAnswer);
      socket.off('voice:ice-candidate', handleIce);
    };
  }, [socket, ensureMic]);

  // Le partenaire prend ou rend la parole.
  useEffect(() => {
    if (!socket) return;
    const onPeer = (data: { playerId: 1 | 2; speaking: boolean }) => {
      if (data.playerId === playerId) return;
      setPeerSpeaking(data.speaking);
      if (data.speaking) playSound('pttIncoming');
    };
    socket.on('voice:peer-ptt', onPeer);
    return () => { socket.off('voice:peer-ptt', onPeer); };
  }, [socket, playerId, playSound]);

  // Filet de securite : si l'onglet perd le focus ou que le doigt sort du
  // bouton, on rend la parole. Sans cela le micro resterait ouvert.
  useEffect(() => {
    if (!speaking) return;
    const release = () => stopTalking();
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
    };
  }, [speaking, stopTalking]);

  // Barre d'espace : parler sans viser le bouton, sur ordinateur.
  useEffect(() => {
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(el.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      void startTalking();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target)) return;
      stopTalking();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [startTalking, stopTalking]);

  // Liberation du micro au demontage : sans cela, l'indicateur d'enregistrement
  // du navigateur reste allume apres la partie.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    pcRef.current?.close();
  }, []);

  return (
    <>
      {/* Bandeau quand le partenaire parle. Portail : le bouton vit dans la
          barre animee, son transform capturait ce position:fixed. */}
      {createPortal(<AnimatePresence>
        {peerSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            role="status"
            aria-live="polite"
            className="fixed left-1/2 -translate-x-1/2 z-[88] flex items-center gap-2
                       px-4 py-2 rounded-full bg-[#e8557f] text-white text-sm font-bold shadow-lg"
            style={{ top: 'calc(var(--safe-t) + 96px)' }}
          >
            <motion.span
              animate={{ scale: [1, 1.35, 1] }}
              transition={{ repeat: Infinity, duration: 0.9 }}
              aria-hidden="true"
            >
              🎙️
            </motion.span>
            {partnerName} parle…
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {/* Bouton maintenu. onPointerDown/Up plutot que onClick : il faut
          distinguer l'appui du relachement. */}
      <button
        type="button"
        onPointerDown={(e) => { e.preventDefault(); void startTalking(); }}
        onContextMenu={(e) => e.preventDefault()}   /* pas de menu sur appui long */
        aria-label={speaking ? 'Relacher pour arreter de parler' : 'Maintenir pour parler'}
        aria-pressed={speaking}
        title={denied ? 'Micro refuse' : 'Maintenir pour parler (ou barre d\'espace)'}
        className={`relative shrink-0 w-11 h-11 rounded-full flex items-center justify-center
                    transition-colors touch-none select-none
                    ${speaking
                      ? 'bg-[#e8557f] text-white'
                      : denied
                        ? 'bg-white/10 text-white/35'
                        : 'bg-white/15 text-white/80 hover:bg-white/25'}`}
      >
        {/* Halo proportionnel au niveau capte : preuve visible que ca passe */}
        {speaking && (
          <span
            className="absolute inset-0 rounded-full bg-[#e8557f]"
            style={{ transform: `scale(${1 + level * 0.55})`, opacity: 0.28 }}
            aria-hidden="true"
          />
        )}
        <span className="relative" aria-hidden="true">{denied ? '🚫' : '🎙️'}</span>
      </button>

      {/* Sortie du flux distant. autoPlay + playsInline : sans cela, iOS
          n'emet aucun son meme une fois la connexion etablie. */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {!ready && denied && (
        <span className="sr-only" role="alert">
          Micro indisponible : autorisez l'acces au microphone pour parler.
        </span>
      )}
    </>
  );
}
