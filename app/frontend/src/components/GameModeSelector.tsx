import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { GAME_MODES, type GameMode } from '../../../shared/types';

interface GameModeSelectorProps {
  value: GameMode;
  onChange: (mode: GameMode) => void;
  disabled?: boolean;
  /** 'light' sur carte blanche (creation), 'dark' sur fond de jeu (en partie). */
  variant?: 'light' | 'dark';
}

/**
 * Choix du jeu de couple avant de creer le salon.
 * Le catalogue vient des types partages, aligne sur le registre serveur.
 */
export default function GameModeSelector({ value, onChange, disabled, variant = 'light' }: GameModeSelectorProps) {
  const selected = GAME_MODES.find((m) => m.id === value) ?? GAME_MODES[0];
  const dark = variant === 'dark';

  // Fleches de defilement : sans reperage, on ne devine pas que d'autres jeux
  // existent a droite (la 3e vignette apparait coupee et passe pour un bug).
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const refresh = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    refresh();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', refresh, { passive: true });
    window.addEventListener('resize', refresh);
    return () => {
      el.removeEventListener('scroll', refresh);
      window.removeEventListener('resize', refresh);
    };
  }, [refresh]);

  const scrollBy = (dir: -1 | 1) => {
    trackRef.current?.scrollBy({ left: dir * 148, behavior: 'smooth' });
  };

  const arrowCls = dark
    ? 'bg-white/18 text-white hover:bg-white/28'
    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 shadow-sm';

  const c = {
    title:    dark ? 'text-white/85'  : 'text-gray-600',
    count:    dark ? 'text-white/60'  : 'text-gray-400',
    cardOn:   dark ? 'bg-white/16 border-white/45' : 'bg-[#a3235e]/10 border-[#a3235e]',
    cardOff:  dark ? 'bg-white/6 border-white/12 hover:bg-white/10'
                   : 'bg-gray-50 border-gray-200 hover:bg-gray-100',
    label:    dark ? 'text-white'     : 'text-gray-900',
    tagline:  dark ? 'text-white/55'  : 'text-gray-500',
    badge:    dark ? 'text-white/75 bg-white/15' : 'text-[#a3235e] bg-[#a3235e]/12',
    desc:     dark ? 'text-white/60'  : 'text-gray-500',
  };

  return (
    <div className="w-full">
      {/* U5 — les fleches ‹ › flottaient PAR-DESSUS la rangee : elles
          recouvraient la 3e vignette et sa description passait pour tronquee.
          Elles remontent dans l'en-tete, a cote du compteur : plus rien ne se
          superpose au contenu, et elles restent a portee de pouce sur mobile.
          Elles sont toujours rendues (desactivees en bout de course) pour que
          la ligne d'en-tete ne saute pas au fil du defilement. */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className={`${c.title} text-sm font-bold uppercase tracking-wide`}>Type de jeu</span>
        <div className="flex items-center gap-1.5">
          <span className={`${c.count} text-xs`}>{GAME_MODES.length} disponibles</span>
          <button
            type="button"
            aria-label="Voir les jeux precedents"
            disabled={!canLeft}
            onClick={() => scrollBy(-1)}
            className={`w-8 h-8 min-w-0 min-h-0 rounded-full flex items-center justify-center
                        text-lg leading-none ${arrowCls} ${canLeft ? '' : 'opacity-30 cursor-default'}`}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            aria-label="Voir les jeux suivants"
            disabled={!canRight}
            onClick={() => scrollBy(1)}
            className={`w-8 h-8 min-w-0 min-h-0 rounded-full flex items-center justify-center
                        text-lg leading-none ${arrowCls} ${canRight ? '' : 'opacity-30 cursor-default'}`}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      {/* Rangee defilante : evite une grille qui pousse le bouton de creation
          hors de l'ecran sur mobile. */}
      <div className="relative">
      <div
        ref={trackRef}
        role="radiogroup"
        aria-label="Type de jeu"
        className={`flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory
                    ${canRight ? 'scroll-fade-x' : ''}`}
        style={{ scrollbarWidth: 'none' }}
      >
        {GAME_MODES.map((m) => {
          const active = m.id === value;
          return (
            <motion.button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${m.label} — ${m.tagline}`}
              disabled={disabled}
              onClick={() => onChange(m.id)}
              whileTap={disabled ? {} : { scale: 0.96 }}
              className={`
                shrink-0 snap-start w-[146px] rounded-[18px] px-3 py-3 text-left
                border transition-colors
                ${active ? c.cardOn : c.cardOff}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <span className="text-2xl block leading-none mb-1.5" aria-hidden="true">{m.icon}</span>
              <span className={`block ${c.label} font-bold text-sm leading-tight break-words`}>
                {m.label}
              </span>
              <span className={`block ${c.tagline} text-[11px] leading-tight mt-0.5 break-words`}>
                {m.tagline}
              </span>
              {m.endless && (
                <span className={`inline-block mt-1.5 text-[10px] font-bold ${c.badge} rounded-full px-2 py-0.5`}>
                  sans fin
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
      </div>

      {/* Description du mode retenu : evite d'avoir a tout lire dans les
          vignettes. min-height : les descriptions n'ont pas la meme longueur ;
          sans hauteur reservee, changer de mode faisait sauter le bouton de
          creation sous le doigt (meme defaut que U1). */}
      <motion.p
        key={selected.id}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className={`${c.desc} text-xs leading-snug mt-1 min-h-[3.2em]`}
      >
        {selected.description}
      </motion.p>
    </div>
  );
}
