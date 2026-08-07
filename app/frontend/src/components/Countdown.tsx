import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface CountdownProps {
  timeLeft: number;
  maxTime: number;
  onTimeUp?: () => void;
}

/** Seuil d'urgence, en secondes. Aligne sur la demande de recette (U3). */
const SECONDES_URGENCE = 5;

/**
 * Couleurs de la jauge.
 * Vert d'eau -> ambre -> rouge. Le rouge n'arrive QUE dans les cinq dernieres
 * secondes : avant, il crierait au loup et on cesserait de le regarder.
 * Deux valeurs par palier : la nappe (large, discrete) et la ligne de
 * flottaison (fine, franche).
 */
function couleursJauge(timeLeft: number, progress: number) {
  if (timeLeft <= SECONDES_URGENCE) {
    return { nappe: 'rgba(226, 27, 60, .58)', ligne: 'rgba(255, 92, 122, 1)', texte: '#ff6b85' };
  }
  if (progress <= 0.35) {
    return { nappe: 'rgba(240, 166, 66, .46)', ligne: 'rgba(250, 196, 106, .95)', texte: '#f7c76b' };
  }
  return { nappe: 'rgba(63, 174, 143, .40)', ligne: 'rgba(104, 214, 183, .9)', texte: '#8fe3cb' };
}

/**
 * Minuteur de manche.
 *
 * U3 — l'ancien compteur circulaire de 100px, centre et perdu dans le vide,
 * obligeait a quitter la question des yeux pour savoir combien de temps il
 * restait. Il est remplace par une JAUGE PLEIN ECRAN : le fond de la page se
 * vide progressivement et vire au rouge sur la fin. On lit le temps en vision
 * peripherique, sans jamais decrocher du regard de l'autre — ce qui est tout
 * l'interet d'un jeu de couple.
 *
 * Le chiffre reste affiche, en petit, comme secours.
 */
export default function Countdown({ timeLeft, maxTime, onTimeUp }: CountdownProps) {
  // Ratio borne : un timeLeft superieur au maximum (reconnexion, question
  // rechargee) ne doit pas produire une jauge de 130% de hauteur.
  const denominateur = maxTime > 0 ? maxTime : 1;
  const progress = Math.min(1, Math.max(0, timeLeft / denominateur));
  const urgent = timeLeft <= SECONDES_URGENCE && timeLeft > 0;
  const couleurs = couleursJauge(timeLeft, progress);

  // onTimeUp dans une ref : le passer en dependance d'effet relancait
  // l'effet a chaque rendu du parent (fonction recreee), ce qui pouvait
  // declencher la fin de manche plusieurs fois.
  const rappelFin = useRef(onTimeUp);
  rappelFin.current = onTimeUp;

  useEffect(() => {
    if (timeLeft === 0) rappelFin.current?.();
  }, [timeLeft]);

  return (
    <>
      {/* Jauge de fond. Rendue ici plutot que dans la page : le composant
          recoit deja timeLeft/maxTime, aucun autre fichier n'a besoin de
          changer. `pointer-events: none` en CSS garantit qu'elle ne capte
          jamais un clic destine a une reponse. */}
      <div
        className="timer-gauge"
        aria-hidden="true"
        data-testid="timer-gauge"
        data-restant={timeLeft}
        data-max={maxTime}
      >
        <div
          className="timer-gauge__fill"
          data-urgent={urgent ? 'true' : 'false'}
          data-progression={Math.round(progress * 100)}
          style={{
            // Variables CSS plutot que styles calcules : la transition de
            // hauteur (1s lineaire) reste geree par la feuille de style, donc
            // desactivable par prefers-reduced-motion.
            ['--gauge-h' as string]: `${progress * 100}%`,
            ['--gauge-color' as string]: couleurs.nappe,
            ['--gauge-line' as string]: couleurs.ligne,
          }}
        />
        {urgent && <div className="timer-gauge__alert" />}
      </div>

      {/* Chiffre de secours. Un `role="timer"` + aria-live poli : annonce sans
          couper la lecture de la question. */}
      <motion.div
        className="timer-chip"
        role="timer"
        aria-live="off"
        aria-label={`Temps restant : ${timeLeft} secondes`}
        style={{ color: couleurs.texte, borderColor: urgent ? 'rgba(255,92,122,.5)' : undefined }}
        animate={urgent ? { scale: [1, 1.07, 1] } : { scale: 1 }}
        transition={urgent ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
      >
        <span aria-hidden="true">⏱</span>
        <span>{timeLeft}s</span>
      </motion.div>
    </>
  );
}

export function MiniCountdown({ timeLeft, maxTime }: { timeLeft: number; maxTime: number }) {
  const denominateur = maxTime > 0 ? maxTime : 1;
  const progress = Math.min(100, Math.max(0, (timeLeft / denominateur) * 100));
  const isUrgent = timeLeft <= SECONDES_URGENCE;

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-3 bg-white/20 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={false}
          animate={{
            width: `${progress}%`,
            backgroundColor: isUrgent ? '#e21b3c' : '#3fae8f',
          }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </div>
      <motion.span
        className={`font-bold text-lg min-w-[2ch] ${isUrgent ? 'text-[#ff6b85]' : 'text-white'}`}
        animate={isUrgent ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.5, repeat: isUrgent ? Infinity : 0 }}
      >
        {timeLeft}
      </motion.span>
    </div>
  );
}
