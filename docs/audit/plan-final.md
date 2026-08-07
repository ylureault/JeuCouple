# Plan d'action final — Arbitrage des trois audits (JeuCouple)

Date : 2026-08-07. Arbitre : synthèse des rapports coach/UX, UI/tech/archi, sécurité et de leurs critiques croisées.

Correctifs déjà réalisés, hors périmètre : secret JWT en dur (Sécu 1), hash SHA-256→scrypt (Sécu 2), compte admin par défaut (Sécu 3), dégradation des modes en 'classic' (ARCHI-1), purge des questions synthétiques du mode inverse (ARCHI-3).

---

## Arbitrages des désaccords

1. **Codes de salon 4 chiffres (Sécu 5) vs UX « dictable » (Coach)** — Le Coach a raison sur le fond : la vraie protection est le jeton de session (Sécu 4), le code ne doit servir qu'à rejoindre. Mais la Sécu a raison sur l'énumération des salons en attente : compromis = jeton de session obligatoire + rate-limit/backoff sur join/reconnect + code porté à **6 chiffres numériques** (reste dictable à voix haute, 100× plus d'espace).
2. **Troncature de `game:answer` à 500 (Sécu 7) vs rejet explicite (Coach)** — Le Coach a raison : couper silencieusement une confession est pire qu'un refus. La Sécu s'est elle-même ralliée à l'ack (TL-3) comme point d'application : validation type/longueur dans l'ack, rejet avec message, jamais de troncature muette.
3. **Rooms `playing` au boot → `finished` (ARCHI-2) vs état « interrompue » (Coach)** — Le Coach a raison : un faux écran de résultats (« Tu as gagné ! ») sur une partie avortée est mensonger. L'action minimale d'Archi est retenue, amendée : état terminal distinct « partie interrompue » avec écran dédié.
4. **Persister davantage (cible snapshot/Redis d'ARCHI-2) vs confidentialité (Coach + Sécu §2)** — Coach et Sécu ont raison contre l'instinct archi : les réponses libres sont des données de vie sexuelle (RGPD art. 9) stockées en clair sans purge. Pour ce produit, on persiste **moins** : purge des answers à la fin de room, aucun snapshot en clair des confessions.
5. **Double-ack « on a fini de comparer » (UX 6) vs simple décompte (tech lead)** — Le tech lead a raison : un décompte visible couvre 90 % du besoin pour 5 % du coût ; pas de nouveau protocole de double ack pour ça.
6. **Priorité GRAVE des UI 1-3 (240 hex, 3 sources de couleur) vs rétrogradation (Coach)** — Le Coach a raison : dette de maintenance sans impact utilisateur ressenti → P2 en continu. Exception : le contraste WCAG (UI 5) touche de vrais utilisateurs → remonté avec les correctifs d'écrans.
7. **Features de consentement d'abord (Coach) vs refactor d'abord (tech lead)** — Le tech lead a raison sur le séquencement (la validation de palier exige le protocole d'accord mutuel généralisé, à ne pas bâtir en 4e demi-protocole ad hoc), **sauf** pour le récap lobby + accord du joueur 2, bon marché de son propre aveu → passe en P0.
8. **CORS « surclassé » (tech lead) vs Sécu 8/9** — La Sécu a raison désormais : les failles admin qui le surclassaient sont corrigées, le CORS ouvert redevient une surface réelle → PR durcissement en P1.

---

## État d'exécution (2026-08-07, fin de session)

| # | Action | État |
|---|--------|------|
| 1-5 | Tous les P0 (jeton, ack, rate-limit, purge, récap lobby) | ✅ livrés, vérifiés e2e (11/11) |
| 6 | Passer gratuit + joker scoreless | ✅ livré, vérifié e2e (0 point exact) |
| 7 | Écrans (fin coopérative, endless, décompte, avatars, contraste) | ✅ livré |
| 8 | Parties interrompues + purge roomSettings | ✅ livré, vérifié e2e |
| 9 | CORS liste blanche + helmet/CSP | ✅ livré (révocation token admin : non faite, TTL 24 h en place) |
| 10 | Révision éditoriale des questions | ✅ livrée (12 questions reformulées + 3 retouches) |
| 11 | Refactor structurel puis validation des paliers Escalade | ⏳ prochain chantier — l'arbitre impose ce séquencement ; en attendant, le P0-5 fait consentir les DEUX joueurs au mode Escalade dès le lobby |
| 12 | Dette UI en continu | ⏳ entamée (contraste, accents) — le reste au fil de l'eau |

## Plan unique et priorisé (12 actions)

1. **[P0]** Jeton de session secret exigé au join et au `room:reconnect` + rate-limit/backoff sur ces handlers + code de salon porté à 6 chiffres numériques — *Sécu 4+5, amendé par le Coach (jeton invisible en localStorage, code qui reste dictable) ; je passe outre l'alphanumérique ≥6 de la Sécu : le jeton fait le travail d'authentification, pas le code.*
2. **[P0]** Passer `game:answer` en callback ack `{accepted}` avec validation type + longueur ≤500 côté serveur, rejet explicite (toast + rollback), jamais de troncature silencieuse — *TL-3 + Sécu 7 + Coach ; les trois convergent sur ce point de code.*
3. **[P0]** Rate-limiting par socket et par type d'événement (buzz, kiss, réactions, chat, relais voice) + `maxHttpBufferSize` réduit — limites généreuses, drop silencieux au-delà, aucun message d'erreur punitif en pleine partie — *Sécu 6, style d'implémentation imposé par le Coach.*
4. **[P0]** Purge des `answers` (et du chat rejoué) à la fin/expiration de la room ; traiter réponses libres, surnoms et confessions comme données sensibles : pas de nouvelle persistance en clair (snapshot inclus) — *Coach (débat) + Sécu §2 ; je passe outre la cible « snapshot GameState/Redis » d'ARCHI-2 pour ces données.*
5. **[P0]** Récapitulatif complet des réglages (mode, thème, nombre de questions) affiché au lobby aux deux joueurs + accord explicite du joueur 2 avant lancement — *Coach 5 + UX 1 ; jugé bon marché par le tech lead lui-même (les settings existent dans `roomSettings`, il manque un emit).*
6. **[P1]** Bouton « Passer cette question » gratuit et sans commentaire sur tous les types ; Joker expliqué et masqué dans les modes sans points via flags `scoreless`/`endless` ajoutés au registre unique des modes — *Coach 3 + UX 2/4 + ARCHI-5 + TECH 5 ; le tech lead voulait attendre l'extraction de `scoring.ts` : je passe outre pour le bouton (règle serveur simple), la spec propre du scoring suivra au refactor.*
7. **[P1]** Écran Results coopératif sans podium ni vainqueur pour envies/petits_noms/complices ; compteur X/Y masqué si `endless` ; décompte visible au reveal (pas de double-ack) ; avatars genrés corrects dans RevealCard ; plancher de contraste `white/60` pour le texte < 14 px — *UX 3/4/6/7 + UI 5 ; le double-ack de UX 6 est écarté suivant le tech lead.*
8. **[P1]** Au boot du serveur, basculer les rooms `playing` vers un état terminal « partie interrompue » avec écran dédié (excuse, pas de podium) + purger `roomSettings` dans le cycle de nettoyage — *ARCHI-2 + TL-7, amendés par le Coach (pas de faux « finished »).*
9. **[P1]** PR durcissement : CORS Express et Socket.IO en liste blanche d'origines, `helmet()` avec CSP, durée de vie/révocation du token admin — *Sécu 8/9/10/11 ; le tech lead les jugeait surclassés par les failles admin : celles-ci étant corrigées, l'argument tombe.*
10. **[P1]** Révision éditoriale des questions (pure donnée, zéro dépendance code) : supprimer « sans si confiance », toute notation de la performance du partenaire, les comparaisons aux ex/passé sexuel ; sortir les aveux sensibles des formats à révélation forcée et les bilans du format swipe ; reformulations oser_dire et option de genre neutre — *Coach 1-2, 6-12 ; aucun expert opposé.*
11. **[P1]** Refactor structurel : découpe de `gameService.ts` et `GameContext.tsx` en slices, types partagés en workspace npm + check CI, timeouts sur les promesses socket, `room:ping` dédié **exigeant le même jeton de session** ; puis, bâtie sur le protocole d'accord mutuel généralisé (`mode:propose`/`respond`), la validation explicite des deux joueurs à chaque palier Escalade — *TL-1/2/4/6/8 + ARCHI-4/6 + Coach 4 + exigence Sécu sur le ping ; je retiens le séquencement du tech lead contre l'urgence du Coach : un 4e protocole d'accord ad hoc dans le monolithe serait pire que l'attente.*
12. **[P2]** Dette UI en continu, écran par écran : migration des hex en dur vers les tokens `--c-*` exposés dans Tailwind + lint interdisant `#[0-9a-f]`, suppression des reliquats Kahoot et classes mortes, échelle unique de rayons et de typo, vocabulaire (« jeu »/« thème ») et accents unifiés — *UI 1-4, 6-10 + UX 9/11 ; classement GRAVE initial contesté par le Coach : je suis le Coach, c'est du coût de maintenance, pas de l'expérience.*
