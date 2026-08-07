import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';

/**
 * Ecran affiche tant qu'aucun salon n'est charge.
 *
 * Il existe parce qu'un echec de reprise se traduisait jusqu'ici par un
 * spinner qui tournait indefiniment : l'utilisateur n'avait aucun moyen de
 * savoir que sa session avait ete abandonnee, ni de repartir. Le motif vient
 * directement de la machine de reprise du GameContext.
 */
export default function ResumeGate() {
  const { resumePhase, resumeError, resetGame } = useGame();
  const navigate = useNavigate();

  if (resumePhase === 'failed') {
    return (
      <div className="min-h-[100dvh] bg-[#180512] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <div className="text-6xl mb-6">💔</div>
          <h1 className="text-2xl font-black text-white mb-3">
            Impossible de reprendre la partie
          </h1>
          <p className="text-white/70 mb-8">
            {resumeError || 'La reprise de session a echoue.'}
          </p>
          <button
            onClick={() => {
              resetGame();
              navigate('/');
            }}
            className="w-full py-4 rounded-2xl bg-pink-500 hover:bg-pink-400 transition-colors
                       text-white font-bold text-lg"
          >
            Retour a l&apos;accueil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#180512] flex flex-col items-center justify-center gap-6">
      <div className="spinner w-16 h-16" />
      {resumePhase === 'restoring' && (
        <p className="text-white/60 text-sm">Reprise de la partie en cours...</p>
      )}
    </div>
  );
}
