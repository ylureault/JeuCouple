import { motion } from 'framer-motion';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import { SOUND_REACTIONS } from '../../../shared/types';

export default function SoundReactionBar() {
  const { sendSoundReaction, playerId } = useGame();
  const { playSound, isMuted } = useAudio();

  const handleSoundReaction = (reactionId: typeof SOUND_REACTIONS[number]['id']) => {
    const reaction = SOUND_REACTIONS.find(r => r.id === reactionId);
    if (reaction) {
      // Play the sound locally
      playSound(reaction.sound as 'klaxon' | 'applause' | 'kiss' | 'laugh');
      // Send to partner
      sendSoundReaction(reactionId);
    }
  };

  if (!playerId) return null;

  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="text-white/60 text-xs mr-1">Sons:</span>
      {SOUND_REACTIONS.map((reaction) => (
        <motion.button
          key={reaction.id}
          onClick={() => handleSoundReaction(reaction.id)}
          className={`relative p-1.5 rounded-lg transition-colors ${
            isMuted
              ? 'bg-white/5 opacity-50 cursor-not-allowed'
              : 'bg-white/10 hover:bg-white/20'
          }`}
          whileHover={isMuted ? {} : { scale: 1.1 }}
          whileTap={isMuted ? {} : { scale: 0.9 }}
          disabled={isMuted}
          title={isMuted ? 'Son coupé' : reaction.label}
        >
          <span className="text-lg">{reaction.emoji}</span>
          {isMuted && (
            <span className="absolute inset-0 flex items-center justify-center text-red-500 text-xl">
              🔇
            </span>
          )}
        </motion.button>
      ))}
    </div>
  );
}
