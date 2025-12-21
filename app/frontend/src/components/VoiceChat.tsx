import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import type { VoiceOffer, VoiceAnswer, IceCandidate } from '../../../shared/types';

// ICE servers for WebRTC (using public STUN servers)
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

interface VoiceChatProps {
  compact?: boolean;
}

export default function VoiceChat({ compact = false }: VoiceChatProps) {
  const { socket, playerId, room } = useGame();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [peerEnabled, setPeerEnabled] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [permissionDenied, setPermissionDenied] = useState(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setConnectionState('disconnected');
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    if (!socket) return null;

    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('voice:ice-candidate', {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          setConnectionState('connected');
          break;
        case 'connecting':
          setConnectionState('connecting');
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          setConnectionState('disconnected');
          break;
      }
    };

    return pc;
  }, [socket]);

  // Start voice chat (initiator)
  const startVoiceChat = useCallback(async () => {
    if (!socket || !room?.player2_name) return;

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setPermissionDenied(false);

      // Create peer connection
      const pc = createPeerConnection();
      if (!pc) return;
      peerConnectionRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Create and send offer (only player 1 initiates)
      if (playerId === 1) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('voice:offer', {
          sdp: offer.sdp!,
          type: 'offer'
        });
      }

      setIsEnabled(true);
      setConnectionState('connecting');
      socket.emit('voice:toggle', { enabled: true });

    } catch (err) {
      console.error('Failed to start voice chat:', err);
      if ((err as Error).name === 'NotAllowedError') {
        setPermissionDenied(true);
      }
      cleanup();
    }
  }, [socket, room, playerId, createPeerConnection, cleanup]);

  // Stop voice chat
  const stopVoiceChat = useCallback(() => {
    cleanup();
    setIsEnabled(false);
    setIsMuted(false);
    if (socket) {
      socket.emit('voice:toggle', { enabled: false });
    }
  }, [cleanup, socket]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  }, [isMuted]);

  // Handle incoming voice signals
  useEffect(() => {
    if (!socket) return;

    const handleOffer = async (data: VoiceOffer) => {
      if (!isEnabled || !peerConnectionRef.current) {
        // Auto-accept if we haven't started yet
        if (!isEnabled) {
          await startVoiceChat();
        }
        // Wait a bit for connection to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription({
          sdp: data.sdp,
          type: data.type
        }));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice:answer', {
          sdp: answer.sdp!,
          type: 'answer'
        });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    };

    const handleAnswer = async (data: VoiceAnswer) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription({
          sdp: data.sdp,
          type: data.type
        }));
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    };

    const handleIceCandidate = async (data: IceCandidate) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.addIceCandidate(new RTCIceCandidate({
          candidate: data.candidate,
          sdpMLineIndex: data.sdpMLineIndex,
          sdpMid: data.sdpMid
        }));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    };

    const handlePeerToggle = (data: { playerId: 1 | 2; enabled: boolean }) => {
      if (data.playerId !== playerId) {
        setPeerEnabled(data.enabled);
        if (!data.enabled) {
          // Peer disconnected, clean up
          cleanup();
          setIsEnabled(false);
        }
      }
    };

    socket.on('voice:offer', handleOffer);
    socket.on('voice:answer', handleAnswer);
    socket.on('voice:ice-candidate', handleIceCandidate);
    socket.on('voice:peer-toggle', handlePeerToggle);

    return () => {
      socket.off('voice:offer', handleOffer);
      socket.off('voice:answer', handleAnswer);
      socket.off('voice:ice-candidate', handleIceCandidate);
      socket.off('voice:peer-toggle', handlePeerToggle);
    };
  }, [socket, playerId, isEnabled, startVoiceChat, cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Don't show if not in a room with 2 players
  if (!room || !room.player2_name) {
    return null;
  }

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    if (permissionDenied) return 'Micro refusé';
    switch (connectionState) {
      case 'connected': return 'Connecté';
      case 'connecting': return 'Connexion...';
      default: return isEnabled ? 'En attente...' : 'Désactivé';
    }
  };

  // Compact mode for header bar
  if (compact) {
    return (
      <>
        <audio ref={remoteAudioRef} autoPlay playsInline />
        <motion.button
          onClick={isEnabled ? stopVoiceChat : startVoiceChat}
          whileTap={{ scale: 0.9 }}
          className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm
            transition-colors
            ${isEnabled
              ? connectionState === 'connected' ? 'bg-green-500' : 'bg-yellow-500'
              : 'bg-white/10 hover:bg-white/20'
            }
            ${permissionDenied ? 'bg-red-500/50' : ''}
          `}
        >
          {isEnabled ? (isMuted ? '🔇' : '🎤') : '🎙️'}
        </motion.button>
        {isEnabled && (
          <motion.button
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={toggleMute}
            whileTap={{ scale: 0.9 }}
            className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm
              ${isMuted ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}
            `}
          >
            {isMuted ? '🔇' : '🔊'}
          </motion.button>
        )}
      </>
    );
  }

  return (
    <>
      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Voice chat button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2"
      >
        {/* Main toggle button */}
        <motion.button
          onClick={isEnabled ? stopVoiceChat : startVoiceChat}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`
            relative flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm
            transition-all duration-200 shadow-lg
            ${isEnabled
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white'
              : 'bg-white/20 text-white hover:bg-white/30'
            }
            ${permissionDenied ? 'bg-red-500/50' : ''}
          `}
        >
          {/* Status indicator */}
          <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />

          {/* Microphone icon */}
          <span className="text-lg">
            {isEnabled ? (isMuted ? '🔇' : '🎤') : '🎙️'}
          </span>

          <span className="hidden sm:inline">
            {isEnabled ? getStatusText() : 'Activer le vocal'}
          </span>
        </motion.button>

        {/* Mute button (only when enabled) */}
        <AnimatePresence>
          {isEnabled && (
            <motion.button
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              onClick={toggleMute}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center text-lg
                transition-colors shadow-lg
                ${isMuted
                  ? 'bg-red-500 text-white'
                  : 'bg-white/20 text-white hover:bg-white/30'
                }
              `}
            >
              {isMuted ? '🔇' : '🔊'}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Peer status indicator */}
        {peerEnabled && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1 bg-green-500/20 rounded-full px-3 py-1"
          >
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-white">Partenaire connecté</span>
          </motion.div>
        )}
      </motion.div>
    </>
  );
}
