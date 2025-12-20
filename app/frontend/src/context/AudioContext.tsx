import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode
} from 'react';

interface SoundContextType {
  isMuted: boolean;
  toggleMute: () => void;
  playSound: (sound: SoundType) => void;
  playLobbyMusic: () => void;
  stopLobbyMusic: () => void;
}

type SoundType = 'click' | 'correct' | 'wrong' | 'tick' | 'reveal' | 'fanfare' | 'countdown' | 'notification';

// Web Audio API type
type WebAudioContext = typeof window.AudioContext;

const SoundContext = createContext<SoundContextType | null>(null);

// Simple sound effects using Web Audio API (no external files needed)
function createOscillatorSound(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.3
): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + duration);
    } catch {
      // Audio not supported
    }
  };
}

function createClickSound(): () => void {
  return createOscillatorSound(800, 0.1, 'sine', 0.2);
}

function createCorrectSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

      notes.forEach((freq, i) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.1);

        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.1 + 0.3);

        oscillator.start(audioCtx.currentTime + i * 0.1);
        oscillator.stop(audioCtx.currentTime + i * 0.1 + 0.3);
      });
    } catch {
      // Audio not supported
    }
  };
}

function createWrongSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(100, audioCtx.currentTime + 0.3);

      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Audio not supported
    }
  };
}

function createTickSound(): () => void {
  return createOscillatorSound(1000, 0.05, 'square', 0.1);
}

function createRevealSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.2);

      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Audio not supported
    }
  };
}

function createFanfareSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

      notes.forEach((freq, i) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.15);

        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.15 + 0.4);

        oscillator.start(audioCtx.currentTime + i * 0.15);
        oscillator.stop(audioCtx.currentTime + i * 0.15 + 0.4);
      });
    } catch {
      // Audio not supported
    }
  };
}

function createNotificationSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      // Two-tone notification sound (like a message ping)
      const notes = [880, 1174.66]; // A5, D6

      notes.forEach((freq, i) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.12);

        gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime + i * 0.12);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.12 + 0.15);

        oscillator.start(audioCtx.currentTime + i * 0.12);
        oscillator.stop(audioCtx.currentTime + i * 0.12 + 0.15);
      });
    } catch {
      // Audio not supported
    }
  };
}

const sounds: Record<SoundType, () => void> = {
  click: createClickSound(),
  correct: createCorrectSound(),
  wrong: createWrongSound(),
  tick: createTickSound(),
  reveal: createRevealSound(),
  fanfare: createFanfareSound(),
  countdown: createTickSound(),
  notification: createNotificationSound()
};

// Procedural ambient music generator using Web Audio API
let ambientAudioContext: AudioContext | null = null;
let ambientGainNode: GainNode | null = null;
let ambientOscillators: OscillatorNode[] = [];
let isAmbientPlaying = false;

function startAmbientMusic(volume: number = 0.08) {
  if (isAmbientPlaying) return;

  try {
    ambientAudioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    ambientGainNode = ambientAudioContext.createGain();
    ambientGainNode.gain.setValueAtTime(volume, ambientAudioContext.currentTime);
    ambientGainNode.connect(ambientAudioContext.destination);

    // Create multiple oscillators for a rich ambient pad
    const baseFreqs = [65.41, 82.41, 98.00, 130.81]; // C2, E2, G2, C3 - ambient chord

    baseFreqs.forEach((freq, i) => {
      const osc = ambientAudioContext!.createOscillator();
      const oscGain = ambientAudioContext!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ambientAudioContext!.currentTime);

      // Subtle LFO for movement
      const lfo = ambientAudioContext!.createOscillator();
      const lfoGain = ambientAudioContext!.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.1 + i * 0.05, ambientAudioContext!.currentTime);
      lfoGain.gain.setValueAtTime(2, ambientAudioContext!.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      oscGain.gain.setValueAtTime(0.15 - i * 0.02, ambientAudioContext!.currentTime);
      osc.connect(oscGain);
      oscGain.connect(ambientGainNode!);
      osc.start();

      ambientOscillators.push(osc, lfo);
    });

    isAmbientPlaying = true;
  } catch {
    // Audio not supported
  }
}

function stopAmbientMusic() {
  if (!isAmbientPlaying) return;

  try {
    ambientOscillators.forEach(osc => {
      try { osc.stop(); } catch { /* ignore */ }
    });
    ambientOscillators = [];

    if (ambientAudioContext) {
      ambientAudioContext.close();
      ambientAudioContext = null;
    }
    ambientGainNode = null;
    isAmbientPlaying = false;
  } catch {
    // Ignore cleanup errors
  }
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    return () => {
      stopAmbientMusic();
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newMuted = !prev;
      if (newMuted) {
        stopAmbientMusic();
      }
      return newMuted;
    });
  }, []);

  const playSound = useCallback((sound: SoundType) => {
    if (!isMuted && sounds[sound]) {
      sounds[sound]();
    }
  }, [isMuted]);

  const playLobbyMusic = useCallback(() => {
    if (!isMuted) {
      startAmbientMusic(0.08);
    }
  }, [isMuted]);

  const stopLobbyMusic = useCallback(() => {
    stopAmbientMusic();
  }, []);

  return (
    <SoundContext.Provider
      value={{
        isMuted,
        toggleMute,
        playSound,
        playLobbyMusic,
        stopLobbyMusic
      }}
    >
      {children}
    </SoundContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
