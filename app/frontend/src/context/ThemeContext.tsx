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
      primary: '#7c5cd6',
      secondary: '#a878d8',
      accent: '#9c27b0',
      background: 'from-[#24091d] via-[#3d1330] to-[#180512]',
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
      primary: '#e8557f',
      secondary: '#f2789a',
      accent: '#ff4081',
      background: 'from-[#2b0716] via-[#5c1030] to-[#1b0410]',
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
      primary: '#3d8fd1',
      secondary: '#5cc6e0',
      accent: '#48cae4',
      background: 'from-[#04122b] via-[#0b2f52] to-[#030b1c]',
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
      primary: '#f2704e',
      secondary: '#f0a642',
      accent: '#ffb347',
      background: 'from-[#2b1206] via-[#5c2a10] to-[#1a0a04]',
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
      background: 'from-[#2b0a1f] via-[#123b45] to-[#1d0930]',
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
      background: 'from-[#08080c] via-[#14141f] to-[#0a0a12]',
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
