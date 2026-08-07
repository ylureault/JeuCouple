/**
 * Consultation d'un salon AVANT d'agir, et messages d'erreur en francais.
 *
 * Deux bugs de recette vivaient ici :
 *  - un code inconnu envoyait quand meme le joueur dans un salon (B6) ;
 *  - /salon/:code perime affichait une page noire et muette (B7).
 * Dans les deux cas le client agissait sans savoir. Il sait maintenant.
 */

// En developpement le front (5174) et le back (3004) sont sur deux ports ;
// en production le back sert le front, l'origine est la meme.
const API_BASE = import.meta.env.DEV ? 'http://localhost:3004' : '';

export interface EtatSalon {
  exists: boolean;
  status: 'waiting' | 'playing' | 'finished' | null;
  full: boolean;
  joinable: boolean;
}

/**
 * Renvoie l'etat du salon, ou null si le serveur est injoignable.
 * Le null est important : on ne doit jamais annoncer "cette partie n'existe
 * plus" a cause d'une simple coupure reseau.
 */
export async function consulterSalon(code: string): Promise<EtatSalon | null> {
  try {
    const reponse = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(code)}`);
    if (!reponse.ok) return null;
    return (await reponse.json()) as EtatSalon;
  } catch {
    return null;
  }
}

/** Message affichable pour un salon qu'on ne peut pas rejoindre. */
export function raisonSalonIndisponible(etat: EtatSalon): { titre: string; detail: string } {
  if (!etat.exists) {
    return {
      titre: "Cette partie n'existe plus",
      detail: "Aucune partie ne correspond à ce code. Le lien a peut-être expiré, ou la partie a été quittée."
    };
  }
  if (etat.status === 'finished') {
    return { titre: "Cette partie n'existe plus", detail: 'Cette partie est déjà terminée.' };
  }
  if (etat.status === 'playing') {
    return { titre: "Cette partie n'existe plus", detail: 'Cette partie a déjà commencé sans toi.' };
  }
  return { titre: "Cette partie n'existe plus", detail: 'Cette partie est déjà complète : deux joueurs y sont déjà.' };
}

// Le serveur parle encore anglais sur quelques refus historiques. L'application
// est en francais : on traduit a l'affichage plutot que de laisser passer
// « Room not found or full » sous les yeux d'un joueur.
const TRADUCTIONS: Array<[RegExp, string]> = [
  [/room not found or full/i, 'Partie introuvable ou déjà complète'],
  [/room not found/i, 'Partie introuvable ou déjà complète'],
  [/room is full/i, 'Partie introuvable ou déjà complète'],
  [/failed to join room/i, 'Impossible de rejoindre cette partie.'],
  [/failed to create room/i, 'Impossible de créer la partie, réessaie.'],
  [/game already finished/i, 'Cette partie est déjà terminée.'],
  [/player slot not found in room/i, "Ta place dans ce salon n'existe plus."],
  [/invalid room/i, 'Code de salon invalide.'],
  [/session expired/i, 'Ta session a expiré.'],
  [/no socket connection/i, 'Pas de connexion au serveur, réessaie.'],
  [/failed to start game/i, 'Impossible de lancer la partie, réessaie.']
];

export function traduireErreur(message: string | null | undefined): string | null {
  if (!message) return null;
  for (const [motif, francais] of TRADUCTIONS) {
    if (motif.test(message)) return francais;
  }
  return message;
}
