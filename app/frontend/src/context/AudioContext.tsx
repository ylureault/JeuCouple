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
  setMusicIntensity: (intensity: number) => void;
  playGameMusic: () => void;
  stopGameMusic: () => void;
}

type SoundType = 'click' | 'correct' | 'wrong' | 'tick' | 'reveal' | 'fanfare' | 'countdown' | 'notification' | 'reaction' | 'reactionReceived' | 'klaxon' | 'applause' | 'ding' | 'kiss' | 'laugh';

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

function createReactionSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      // Fun "pop" sound for emoji reactions
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      // Rising pitch pop sound
      oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.08);
      oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.12);

      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.15);
    } catch {
      // Audio not supported
    }
  };
}

function createReactionReceivedSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      // Cheerful "bling" sound for receiving reactions from partner
      const oscillator = audioCtx.createOscillator();
      const oscillator2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator2.type = 'triangle';

      // Two-tone cheerful sound
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1318.51, audioCtx.currentTime + 0.1);

      oscillator2.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.05);
      oscillator2.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.15);

      gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

      oscillator.start(audioCtx.currentTime);
      oscillator2.start(audioCtx.currentTime + 0.05);
      oscillator.stop(audioCtx.currentTime + 0.15);
      oscillator2.stop(audioCtx.currentTime + 0.2);
    } catch {
      // Audio not supported
    }
  };
}

function createKlaxonSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      // Car horn sound - alternating tones
      const oscillator1 = audioCtx.createOscillator();
      const oscillator2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator1.type = 'sawtooth';
      oscillator2.type = 'square';

      // Classic two-tone horn (A4 and F4)
      oscillator1.frequency.setValueAtTime(440, audioCtx.currentTime);
      oscillator2.frequency.setValueAtTime(349.23, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime + 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator1.start(audioCtx.currentTime);
      oscillator2.start(audioCtx.currentTime);
      oscillator1.stop(audioCtx.currentTime + 0.5);
      oscillator2.stop(audioCtx.currentTime + 0.5);
    } catch {
      // Audio not supported
    }
  };
}

function createApplauseSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      // Simulated applause using white noise bursts
      const bufferSize = audioCtx.sampleRate * 0.8;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);

      // Create noise pattern that sounds like clapping
      for (let i = 0; i < bufferSize; i++) {
        const time = i / audioCtx.sampleRate;
        // Modulate noise to create rhythmic clapping pattern
        const envelope = Math.sin(time * 25) > 0.3 ? 1 : 0.1;
        data[i] = (Math.random() * 2 - 1) * envelope * 0.5;
      }

      const source = audioCtx.createBufferSource();
      const gainNode = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000, audioCtx.currentTime);
      filter.Q.setValueAtTime(0.5, audioCtx.currentTime);

      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);

      source.start(audioCtx.currentTime);
    } catch {
      // Audio not supported
    }
  };
}

function createDingSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      // Pleasant "ding" notification bell sound
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      // High bell-like tone
      oscillator.frequency.setValueAtTime(1318.51, audioCtx.currentTime); // E6

      gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch {
      // Audio not supported
    }
  };
}

function createKissSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      // Cute "kiss" popping sound
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      // Quick descending "mwah" sound
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.15);

      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch {
      // Audio not supported
    }
  };
}

function createLaughSound(): () => void {
  return () => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: WebAudioContext }).webkitAudioContext)();
      // Fun bouncy laugh-like sound
      const notes = [523.25, 659.25, 783.99, 659.25, 523.25]; // Ha-ha-ha pattern

      notes.forEach((freq, i) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.1);

        gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime + i * 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.1 + 0.12);

        oscillator.start(audioCtx.currentTime + i * 0.1);
        oscillator.stop(audioCtx.currentTime + i * 0.1 + 0.12);
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
  notification: createNotificationSound(),
  reaction: createReactionSound(),
  reactionReceived: createReactionReceivedSound(),
  klaxon: createKlaxonSound(),
  applause: createApplauseSound(),
  ding: createDingSound(),
  kiss: createKissSound(),
  laugh: createLaughSound()
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

// Game music with intensity that changes based on streak
let gameAudioContext: AudioContext | null = null;
let gameGainNode: GainNode | null = null;
let gameOscillators: OscillatorNode[] = [];
let isGameMusicPlaying = false;
let currentIntensity = 0;

function startGameMusic(volume: number = 0.06) {
  if (isGameMusicPlaying) return;

  try {
    gameAudioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    gameGainNode = gameAudioContext.createGain();
    gameGainNode.gain.setValueAtTime(volume, gameAudioContext.currentTime);
    gameGainNode.connect(gameAudioContext.destination);

    // Base game music - rhythmic pulse
    const baseFreqs = [110, 138.59, 164.81]; // A2, C#3, E3 - A major chord

    baseFreqs.forEach((freq, i) => {
      const osc = gameAudioContext!.createOscillator();
      const oscGain = gameAudioContext!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, gameAudioContext!.currentTime);

      // Rhythmic pulse LFO
      const lfo = gameAudioContext!.createOscillator();
      const lfoGain = gameAudioContext!.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(2 + i * 0.5, gameAudioContext!.currentTime); // Faster pulse
      lfoGain.gain.setValueAtTime(0.3, gameAudioContext!.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(oscGain.gain);
      lfo.start();

      oscGain.gain.setValueAtTime(0.1 - i * 0.02, gameAudioContext!.currentTime);
      osc.connect(oscGain);
      oscGain.connect(gameGainNode!);
      osc.start();

      gameOscillators.push(osc, lfo);
    });

    isGameMusicPlaying = true;
    currentIntensity = 0;
  } catch {
    // Audio not supported
  }
}

function updateGameMusicIntensity(intensity: number) {
  if (!isGameMusicPlaying || !gameAudioContext || !gameGainNode) return;

  currentIntensity = Math.max(0, Math.min(5, intensity));

  try {
    // Intensity 0-5 maps to different music characteristics
    // Higher intensity = higher volume, more harmonics
    const baseVolume = 0.06;
    const intensityBonus = currentIntensity * 0.02;
    const newVolume = Math.min(0.2, baseVolume + intensityBonus);

    gameGainNode.gain.linearRampToValueAtTime(
      newVolume,
      gameAudioContext.currentTime + 0.3
    );

    // Add extra tension oscillators at high intensity
    if (currentIntensity >= 3 && gameOscillators.length < 8) {
      // Add high tension notes
      const tensionFreqs = [440, 554.37]; // A4, C#5

      tensionFreqs.forEach((freq) => {
        const osc = gameAudioContext!.createOscillator();
        const oscGain = gameAudioContext!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, gameAudioContext!.currentTime);

        // Tremolo for tension
        const tremolo = gameAudioContext!.createOscillator();
        const tremoloGain = gameAudioContext!.createGain();
        tremolo.type = 'sine';
        tremolo.frequency.setValueAtTime(4 + currentIntensity, gameAudioContext!.currentTime);
        tremoloGain.gain.setValueAtTime(0.5, gameAudioContext!.currentTime);
        tremolo.connect(tremoloGain);
        tremoloGain.connect(oscGain.gain);
        tremolo.start();

        oscGain.gain.setValueAtTime(0.05 * (currentIntensity - 2), gameAudioContext!.currentTime);
        osc.connect(oscGain);
        oscGain.connect(gameGainNode!);
        osc.start();

        gameOscillators.push(osc, tremolo);
      });
    }
  } catch {
    // Ignore errors
  }
}

function stopGameMusic() {
  if (!isGameMusicPlaying) return;

  try {
    gameOscillators.forEach(osc => {
      try { osc.stop(); } catch { /* ignore */ }
    });
    gameOscillators = [];

    if (gameAudioContext) {
      gameAudioContext.close();
      gameAudioContext = null;
    }
    gameGainNode = null;
    isGameMusicPlaying = false;
    currentIntensity = 0;
  } catch {
    // Ignore cleanup errors
  }
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    return () => {
      stopAmbientMusic();
      stopGameMusic();
    };
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newMuted = !prev;
      if (newMuted) {
        stopAmbientMusic();
        stopGameMusic();
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

  const playGameMusic = useCallback(() => {
    if (!isMuted) {
      startGameMusic(0.06);
    }
  }, [isMuted]);

  const stopGameMusicCb = useCallback(() => {
    stopGameMusic();
  }, []);

  const setMusicIntensity = useCallback((intensity: number) => {
    if (!isMuted) {
      updateGameMusicIntensity(intensity);
    }
  }, [isMuted]);

  return (
    <SoundContext.Provider
      value={{
        isMuted,
        toggleMute,
        playSound,
        playLobbyMusic,
        stopLobbyMusic,
        playGameMusic,
        stopGameMusic: stopGameMusicCb,
        setMusicIntensity
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
