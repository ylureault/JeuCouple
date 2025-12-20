import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme, type ThemeName, THEMES } from '../context/ThemeContext';

export default function ThemeSelector() {
  const { themeName, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed top-4 left-4 z-50">
      {/* Toggle button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl shadow-lg border border-white/20 hover:bg-white/30 transition-colors"
        title="Changer le thème"
      >
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          🎨
        </motion.span>
      </motion.button>

      {/* Theme dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute top-12 left-0 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl p-2 min-w-[180px] border border-gray-200"
          >
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-3 py-2">
              Thème
            </p>
            {(Object.keys(THEMES) as ThemeName[]).map((name) => {
              const theme = THEMES[name];
              const isSelected = themeName === name;

              return (
                <motion.button
                  key={name}
                  onClick={() => {
                    setTheme(name);
                    setIsOpen(false);
                  }}
                  whileHover={{ x: 5 }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors
                    ${isSelected
                      ? 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-800'
                      : 'hover:bg-gray-100 text-gray-700'
                    }
                  `}
                >
                  {/* Color preview */}
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-sm shadow-inner"
                    style={{
                      background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary})`
                    }}
                  >
                    {theme.emoji}
                  </div>

                  <span className="font-semibold text-sm">{theme.label}</span>

                  {isSelected && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="ml-auto text-purple-600"
                    >
                      ✓
                    </motion.span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
