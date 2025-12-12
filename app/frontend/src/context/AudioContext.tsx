import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode
} from 'react';
import { Howl, Howler } from 'howler';

interface AudioContextType {
  isMuted: boolean;
  toggleMute: () => void;
  playSound: (sound: SoundType) => void;
  playLobbyMusic: () => void;
  stopLobbyMusic: () => void;
}

type SoundType = 'click' | 'correct' | 'wrong' | 'tick' | 'reveal' | 'fanfare' | 'countdown';

const AudioContext = createContext<AudioContextType | null>(null);

// Simple sound effects using Web Audio API (no external files needed)
function createOscillatorSound(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.3
): () => void {
  return () => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
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
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

      notes.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1);

        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime + i * 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.1 + 0.3);

        oscillator.start(audioContext.currentTime + i * 0.1);
        oscillator.stop(audioContext.currentTime + i * 0.1 + 0.3);
      });
    } catch {
      // Audio not supported
    }
  };
}

function createWrongSound(): () => void {
  return () => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
      oscillator.frequency.linearRampToValueAtTime(100, audioContext.currentTime + 0.3);

      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
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
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
      oscillator.frequency.linearRampToValueAtTime(800, audioContext.currentTime + 0.2);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch {
      // Audio not supported
    }
  };
}

function createFanfareSound(): () => void {
  return () => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

      notes.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.15);

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.15 + 0.4);

        oscillator.start(audioContext.currentTime + i * 0.15);
        oscillator.stop(audioContext.currentTime + i * 0.15 + 0.4);
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
  countdown: createTickSound()
};

export function AudioProvider({ children }: { children: ReactNode }) {
  const [isMuted, setIsMuted] = useState(false);
  const [lobbyMusic, setLobbyMusic] = useState<Howl | null>(null);

  useEffect(() => {
    // Create a simple ambient loop for lobby
    const music = new Howl({
      src: ['data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBQBdncH/6bQ3CgAAQrPg/8qTKQAAAC+qx+Wjaz0AAABQV7S0eD8AAAAwW5KcbkQAAAA/bpuohGVJAAAARXeRlXhaTQAAAFJ+jo56X1MAAABVY4yJfGFYAAAAXWSPiH5mXQAAAGVukIaAamMAAA=='],
      loop: true,
      volume: 0.1,
      html5: true
    });
    setLobbyMusic(music);

    return () => {
      music.unload();
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newMuted = !prev;
      Howler.mute(newMuted);
      return newMuted;
    });
  }, []);

  const playSound = useCallback((sound: SoundType) => {
    if (!isMuted && sounds[sound]) {
      sounds[sound]();
    }
  }, [isMuted]);

  const playLobbyMusic = useCallback(() => {
    if (lobbyMusic && !isMuted) {
      lobbyMusic.play();
    }
  }, [lobbyMusic, isMuted]);

  const stopLobbyMusic = useCallback(() => {
    if (lobbyMusic) {
      lobbyMusic.stop();
    }
  }, [lobbyMusic]);

  return (
    <AudioContext.Provider
      value={{
        isMuted,
        toggleMute,
        playSound,
        playLobbyMusic,
        stopLobbyMusic
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
