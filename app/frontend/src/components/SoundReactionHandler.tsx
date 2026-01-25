import { useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { useAudio } from '../context/AudioContext';
import { SOUND_REACTIONS } from '../../../shared/types';

// This component handles playing sound reactions received from the partner
export default function SoundReactionHandler() {
  const { soundReactions, playerId } = useGame();
  const { playSound } = useAudio();
  const lastPlayedRef = useRef<number>(0);

  useEffect(() => {
    if (soundReactions.length === 0) return;

    // Get the most recent sound reaction
    const latestReaction = soundReactions[soundReactions.length - 1];

    // Only play if it's from the other player and newer than last played
    if (latestReaction.playerId !== playerId && latestReaction.timestamp > lastPlayedRef.current) {
      lastPlayedRef.current = latestReaction.timestamp;

      // Find the sound to play
      const reaction = SOUND_REACTIONS.find(r => r.id === latestReaction.reactionId);
      if (reaction) {
        playSound(reaction.sound as 'klaxon' | 'applause' | 'kiss' | 'laugh');
      }
    }
  }, [soundReactions, playerId, playSound]);

  // This component doesn't render anything
  return null;
}
