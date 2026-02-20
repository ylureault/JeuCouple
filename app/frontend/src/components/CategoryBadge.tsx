import { motion } from 'framer-motion';

interface CategoryBadgeProps {
  category: string;
  size?: 'sm' | 'md' | 'lg';
}

const categoryStyles: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  couple: {
    bg: 'bg-pink-500/20',
    text: 'text-pink-300',
    border: 'border-pink-400/30',
    emoji: '💑'
  },
  sexy: {
    bg: 'bg-red-500/20',
    text: 'text-red-300',
    border: 'border-red-400/30',
    emoji: '🔥'
  },
  coquin: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-300',
    border: 'border-purple-400/30',
    emoji: '😈'
  },
  habitudes: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-300',
    border: 'border-blue-400/30',
    emoji: '🏠'
  },
  souvenirs: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-400/30',
    emoji: '📸'
  },
  projets: {
    bg: 'bg-green-500/20',
    text: 'text-green-300',
    border: 'border-green-400/30',
    emoji: '🎯'
  },
  fun: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-300',
    border: 'border-yellow-400/30',
    emoji: '🎉'
  },
  preferences: {
    bg: 'bg-indigo-500/20',
    text: 'text-indigo-300',
    border: 'border-indigo-400/30',
    emoji: '⭐'
  },
  profond: {
    bg: 'bg-violet-500/20',
    text: 'text-violet-300',
    border: 'border-violet-400/30',
    emoji: '💭'
  },
  culture: {
    bg: 'bg-teal-500/20',
    text: 'text-teal-300',
    border: 'border-teal-400/30',
    emoji: '🧠'
  },
  comportement: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-300',
    border: 'border-orange-400/30',
    emoji: '🎭'
  },
  intime: {
    bg: 'bg-rose-500/20',
    text: 'text-rose-300',
    border: 'border-rose-400/30',
    emoji: '💋'
  },
  humour: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-300',
    border: 'border-yellow-400/30',
    emoji: '😂'
  },
  communication: {
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-300',
    border: 'border-cyan-400/30',
    emoji: '💬'
  },
  fantasmes: {
    bg: 'bg-fuchsia-500/20',
    text: 'text-fuchsia-300',
    border: 'border-fuchsia-400/30',
    emoji: '💭'
  },
  fellation: {
    bg: 'bg-pink-500/20',
    text: 'text-pink-300',
    border: 'border-pink-400/30',
    emoji: '👄'
  },
  cunnilingus: {
    bg: 'bg-pink-400/20',
    text: 'text-pink-300',
    border: 'border-pink-300/30',
    emoji: '👅'
  },
  sodomie: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-300',
    border: 'border-orange-400/30',
    emoji: '🍑'
  },
  kamasutra: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-400/30',
    emoji: '🧘'
  },
  bdsm: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-300',
    border: 'border-gray-400/30',
    emoji: '⛓️'
  },
  preliminaires: {
    bg: 'bg-red-400/20',
    text: 'text-red-300',
    border: 'border-red-300/30',
    emoji: '💋'
  },
  sextoys: {
    bg: 'bg-fuchsia-500/20',
    text: 'text-fuchsia-300',
    border: 'border-fuchsia-400/30',
    emoji: '🎀'
  },
  confessions: {
    bg: 'bg-rose-500/20',
    text: 'text-rose-300',
    border: 'border-rose-400/30',
    emoji: '🤫'
  },
  seduction: {
    bg: 'bg-rose-500/20',
    text: 'text-rose-300',
    border: 'border-rose-400/30',
    emoji: '😏'
  },
  massage: {
    bg: 'bg-teal-400/20',
    text: 'text-teal-300',
    border: 'border-teal-300/30',
    emoji: '💆'
  },
  jeux_role: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-300',
    border: 'border-emerald-400/30',
    emoji: '🎭'
  }
};

const defaultStyle = {
  bg: 'bg-gray-500/20',
  text: 'text-gray-300',
  border: 'border-gray-400/30',
  emoji: '❓'
};

export default function CategoryBadge({ category, size = 'md' }: CategoryBadgeProps) {
  const style = categoryStyles[category.toLowerCase()] || defaultStyle;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        inline-flex items-center gap-1 rounded-full font-semibold
        uppercase tracking-wider border
        ${style.bg} ${style.text} ${style.border}
        ${sizeClasses[size]}
      `}
    >
      <span>{style.emoji}</span>
      <span>{category}</span>
    </motion.span>
  );
}
