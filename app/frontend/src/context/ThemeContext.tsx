import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type ThemeName = 'classic' | 'romance' | 'ocean' | 'sunset' | 'rainbow' | 'dark';

interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  gradient: string;
  correct: string;
  wrong: string;
}

interface Theme {
  name: ThemeName;
  label: string;
  emoji: string;
  colors: ThemeColors;
}

export const THEMES: Record<ThemeName, Theme> = {
  classic: {
    name: 'classic',
    label: 'Classique',
    emoji: '💜',
    colors: {
      primary: '#46178f',
      secondary: '#7b2cbf',
      accent: '#9c27b0',
      background: 'from-[#1a0a2e] via-[#46178f] to-[#7b2cbf]',
      gradient: 'from-[#46178f] to-[#7b2cbf]',
      correct: '#26890c',
      wrong: '#e21b3c'
    }
  },
  romance: {
    name: 'romance',
    label: 'Romance',
    emoji: '💕',
    colors: {
      primary: '#e91e63',
      secondary: '#f06292',
      accent: '#ff4081',
      background: 'from-[#880e4f] via-[#e91e63] to-[#f48fb1]',
      gradient: 'from-[#e91e63] to-[#f06292]',
      correct: '#4caf50',
      wrong: '#f44336'
    }
  },
  ocean: {
    name: 'ocean',
    label: 'Océan',
    emoji: '🌊',
    colors: {
      primary: '#0077b6',
      secondary: '#00b4d8',
      accent: '#48cae4',
      background: 'from-[#03045e] via-[#0077b6] to-[#00b4d8]',
      gradient: 'from-[#0077b6] to-[#00b4d8]',
      correct: '#2a9d8f',
      wrong: '#e76f51'
    }
  },
  sunset: {
    name: 'sunset',
    label: 'Coucher de soleil',
    emoji: '🌅',
    colors: {
      primary: '#ff6b35',
      secondary: '#f7931e',
      accent: '#ffb347',
      background: 'from-[#1a1a2e] via-[#ff6b35] to-[#f7931e]',
      gradient: 'from-[#ff6b35] to-[#f7931e]',
      correct: '#4ecdc4',
      wrong: '#ff6b6b'
    }
  },
  rainbow: {
    name: 'rainbow',
    label: 'Arc-en-ciel',
    emoji: '🌈',
    colors: {
      primary: '#9c27b0',
      secondary: '#2196f3',
      accent: '#4caf50',
      background: 'from-[#ff6b6b] via-[#4ecdc4] to-[#9c27b0]',
      gradient: 'from-[#ff6b6b] via-[#ffd93d] via-[#6bcb77] via-[#4d96ff] to-[#9c27b0]',
      correct: '#6bcb77',
      wrong: '#ff6b6b'
    }
  },
  dark: {
    name: 'dark',
    label: 'Mode nuit',
    emoji: '🌙',
    colors: {
      primary: '#1a1a2e',
      secondary: '#16213e',
      accent: '#0f3460',
      background: 'from-[#0a0a0f] via-[#1a1a2e] to-[#16213e]',
      gradient: 'from-[#1a1a2e] to-[#16213e]',
      correct: '#00d9ff',
      wrong: '#ff4757'
    }
  }
};

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = 'jeucouple_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('classic');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in THEMES) {
      setThemeName(stored as ThemeName);
    }
  }, []);

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
    localStorage.setItem(STORAGE_KEY, name);

    // Update CSS variables for the theme
    const root = document.documentElement;
    const colors = THEMES[name].colors;
    root.style.setProperty('--theme-primary', colors.primary);
    root.style.setProperty('--theme-secondary', colors.secondary);
    root.style.setProperty('--theme-accent', colors.accent);
    root.style.setProperty('--theme-correct', colors.correct);
    root.style.setProperty('--theme-wrong', colors.wrong);
  };

  // Apply initial theme
  useEffect(() => {
    const colors = THEMES[themeName].colors;
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', colors.primary);
    root.style.setProperty('--theme-secondary', colors.secondary);
    root.style.setProperty('--theme-accent', colors.accent);
    root.style.setProperty('--theme-correct', colors.correct);
    root.style.setProperty('--theme-wrong', colors.wrong);
  }, [themeName]);

  return (
    <ThemeContext.Provider
      value={{
        theme: THEMES[themeName],
        themeName,
        setTheme,
        themes: THEMES
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
