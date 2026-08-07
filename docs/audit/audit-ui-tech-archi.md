# Audit UI designer + Tech lead + Architecte

Projet : /home/user/JeuCouple — React/Vite/Tailwind (frontend), Node/Socket.IO/better-sqlite3 (backend).
Fichiers pivots : `app/frontend/src/index.css` (1006 l.), `app/frontend/src/context/GameContext.tsx` (1038 l.), `app/backend/src/services/gameService.ts` (1997 l.), `app/shared/types.ts` = `app/backend/src/types.ts` (542 l. chacun, md5 identiques ce jour).

---

## UI (designer)

1. **[GRAVE]** `app/frontend/src/components/QuestionCard.tsx:213-942` — Les types E, F, G, H, I, L, N, S utilisent des dégradés hex en dur issus de la palette Kahoot/Material (`#26890c`, `#e21b3c`, `#1368ce`, `#9c27b0`, `#673ab7`…) alors que les types A/B utilisent le nouveau quatuor `--c-ans-*` : deux systèmes de boutons coexistent dans le même écran de jeu. Action : réécrire tous les renderType* sur les classes `.btn-answer-*` / jetons `--c-ans-*` et supprimer les gradients inline.

2. **[GRAVE]** frontend/src (grep) — **240** couleurs hex en dur dans les `.tsx` (QuestionCard 26, RevealCard 21, ThemeContext 42, Results 15…) et **0** usage de `var(--c-…)` dans les composants : les jetons `--c-*` ne vivent que dans index.css, le système de design n'est pas réellement adopté. Action : exposer les jetons comme couleurs Tailwind (`colors: { rose: 'var(--c-rose-500)' }`) et migrer fichier par fichier en interdisant `#[0-9a-f]` via lint.

3. **[GRAVE]** `app/frontend/tailwind.config.js:10-30` — Troisième source de vérité couleur : `primary #E91E63` / `secondary #9C27B0` / bloc `kahoot` (`#E21B3C`, `#1368CE`, `#D89E00`, `#26890C`) divergent des jetons CSS (`--c-rose-500 #e8557f`). Action : supprimer le bloc `kahoot`, aligner primary/secondary sur les variables CSS.

4. **[MOYEN]** `app/frontend/src/index.css:141-152, 336-388` + grep — Reliquats Kahoot : **17** occurrences "kahoot" dans index.css + **6** dans les tsx (`.bg-kahoot-purple` avec `#46178f` — 7 occurrences de ce violet — `.bg-kahoot-lobby`, `.input-kahoot`, `.btn-kahoot-main`), slider `input[type="range"]` en dégradé `#e21b3c→#d89e00→#26890c` (17 occurrences chacun pour `#e21b3c` et `#26890c` dans src), et `shape-triangle`/`shape-diamond`/`shape-circle`/`shape-square` définis mais plus référencés par aucun composant (1 seule occurrence : la définition). Action : supprimer les classes mortes, renommer `input-kahoot`→`input`, `btn-kahoot-main`→`btn-main`, re-tokeniser le slider.

5. **[MOYEN]** `app/frontend/src/components/DuelThemePicker.tsx:80,118` + `GameModeSelector.tsx:56` — Texte `text-white/45` en 11 px et `text-white/40` (8 occurrences white/40, 4 white/45, 4 white/3x dans src) sur fond nuit `#180512` : contraste effectif ≈ 3,5-4:1, sous le seuil WCAG AA (4,5:1) pour du texte de cette taille. Action : plancher à `white/60` pour tout texte informatif < 14 px, réserver /40 aux éléments purement décoratifs.

6. **[MOYEN]** grep `rounded-` — **13 variantes** de rayons dans les tsx (`rounded-full` 87, `xl` 49, `lg` 27, `2xl` 10, plus les arbitraires `[14px]`, `[16px]`, `[18px]`, `[22px]`, `[28px]`, `3xl`, `md`) auxquelles s'ajoutent `[18px]`/`[20px]` dans index.css : aucune échelle de rayons. Action : définir 3 rayons de thème (contrôle 16px, carte 20px, feuille 28px) dans tailwind.config et bannir les valeurs arbitraires.

7. **[MOYEN]** `app/frontend/src/index.css:69` vs `tailwind.config.js:32-35` — Le body impose Nunito mais la config déclare `display: Montserrat` / `body: Inter`, polices jamais chargées : `font-display` rendrait une fallback système. Hiérarchie typographique ad hoc dans les composants (`text-[10px]`, `[11px]`, `[13px]`, tailles au cas par cas). Action : aligner la config sur Nunito et figer une échelle (11/13/15/17/22/28) en classes de thème.

8. **[MINEUR]** `app/frontend/src/components/RevealCard.tsx:397-400, 924` — Le bandeau de résultat et l'échelle comparative réutilisent les verts/rouges Kahoot (`#26890c`, `#e21b3c`, `#1368ce`) au lieu de `--c-ans-4`/`--c-ans-1`, en contradiction directe avec le commentaire de QuestionCard qui annonce leur remplacement. Action : basculer succès/échec sur `--c-ans-4` / `--c-rose-500`.

9. **[MINEUR]** `app/frontend/src/components/QuestionCard.tsx:131,201` — Le bouton « Valider » des types C et D est un `bg-[#26890c]` plein (vert Kahoot) sans classe de bouton du système. Action : utiliser `.btn-start` ou une variante validée du système.

10. **[MINEUR]** `app/frontend/src/index.css:330-333` — `.countdown-urgent` colore l'urgence en `#e21b3c` (rouge Kahoot) alors que la palette définit corail et rose. Action : passer sur `--c-coral-500`.

---

## TECH LEAD

1. **[GRAVE]** `app/frontend/src/context/GameContext.tsx` (1038 l.) — Contexte-dieu : 30+ champs d'état dans un seul provider ; chaque réaction emoji, message de chat ou battement de kiss re-rend tous les consommateurs (Game, Lobby, Results, chats, overlays). Plan de découpe : (a) `SocketProvider` — connexion, session localStorage, reconnexion (l. 434-801) ; (b) `GameCoreProvider` — room/phase/question/scores/reveal ; (c) `SocialProvider` — reactions/chat/quick-messages/buzz/kiss (état volatil à TTL) ; (d) `ModeProvider` — duel + propositions de mode. Un reducer par slice, hooks `useGameCore()`, `useSocial()` etc., et les handlers socket enregistrés par slice.

2. **[GRAVE]** `app/backend/src/services/gameService.ts` (1997 l.) — Un seul fichier porte transport, salons, boucle de jeu, scoring, social, duel et fabrication de questions. Plan de découpe : `state.ts` (Maps activeGames/playerConnections/roomSettings + interfaces), `handlers/roomHandlers.ts` (create/join/reconnect/leave, l. 160-405), `handlers/socialHandlers.ts` (reactions/chat/voice/kiss, l. 762-947), `engine/gameLoop.ts` (sendQuestion/revealAnswers/scheduleNextQuestion/finishGame), `engine/scoring.ts` (calculateBasePoints/SpeedBonus/streaks, l. 1108-1851, pur et testable), `engine/duelTheme.ts` (l. 1490-1589), `engine/invertedRound.ts` (l. 1657-1701).

3. **[GRAVE]** `app/frontend/src/context/GameContext.tsx:882-888` + `app/shared/types.ts:326` — `game:answer` est un emit sans accusé de réception, mais le client fait `SET_MY_ANSWER` immédiatement : si le paquet se perd ou si le serveur rejette (phase ≠ question, doublon, pause — gameService.ts:518-543), le joueur reste en « waiting » sans feedback jusqu'au timeout serveur, et sa réponse est comptée absente (-50 pts). Action : passer `game:answer` en callback ack `{accepted}` et ne dispatcher SET_MY_ANSWER que sur ack (rollback + toast sinon).

4. **[MOYEN]** `GameContext.tsx:826-880` — Les promesses `createRoom`/`joinRoom`/`startGame`/`restartGame` n'ont aucun timeout : si le serveur ne rappelle jamais le callback, la promesse pend et le bouton reste bloqué en état « chargement ». Action : `socket.timeout(5000).emit(...)` (API socket.io) et reject propre.

5. **[MOYEN]** `app/shared/types.ts:361-460` vs `app/backend/src/services/gameModes.ts:64-275` — Le catalogue `GAME_MODES` client duplique le registre serveur (id/label/icon/endless) et diverge déjà : « Classique » vs « Partie classique », descriptions différentes. Ajouter un mode = 3 endroits (registre, catalogue, copie de types). Action : exposer un endpoint/`listGameModes()` sérialisé au client, ou générer le catalogue partagé depuis le registre.

6. **[MOYEN]** `app/backend/src/types.ts` = copie manuelle de `app/shared/types.ts` — Identiques aujourd'hui (même md5) et modifiés ensemble à chaque commit, mais uniquement par discipline : aucun script de sync, aucun check CI. Un oubli = protocole socket qui diverge silencieusement entre client (qui importe `../../shared/types`) et serveur, sans erreur de compilation. Action : workspace npm `@jeucouple/shared` + TS project references (ou `paths` vers ../shared comme le fait déjà le frontend) ; à défaut, un test CI `diff shared/types.ts backend/src/types.ts`.

7. **[MOYEN]** `gameService.ts:96,180` — `roomSettings` n'est **jamais** purgé (aucun `roomSettings.delete` dans le fichier) : une entrée par salon créé, à vie du process, y compris après `cleanupExpiredRooms`. Fuite mémoire lente + réglages fantômes si un code de salon est réutilisé. Action : purge dans `handleDisconnect`/`finishGame` + balayage aligné sur le cleanup des rooms.

8. **[MOYEN]** `GameContext.tsx:765-789` — La « validation de session » toutes les 5 min réutilise `room:reconnect`, qui côté serveur (gameService.ts:277-333) ré-émet `room:player-joined` au partenaire et renvoie question/scores : chaque ping produit des événements fantômes chez l'autre joueur. Action : créer un vrai `room:ping` idempotent en lecture seule.

9. **[MINEUR]** `gameService.ts:150-151` vs `gameModes.ts:59-60` — `UNLIMITED_MODE_QUESTION_COUNT`/`UNLIMITED_MODE_GAP_TO_WIN` sont du code mort dans gameService (la règle vit désormais dans le mode classic) : constante dupliquée qui invite à modifier le mauvais fichier. Action : supprimer.

10. **[MINEUR]** `gameService.ts:1279-1290` — Scoring du type C : `basePoints` est assigné puis écrasé trois lignes plus bas, avec un bloc `if` vide au milieu ; le `||` accorde le bonus « réponse réfléchie » aux deux joueurs si un seul a écrit 20 caractères. Action : nettoyer et trancher la règle (ET vs OU) avec un test unitaire.

---

## ARCHI

1. **[GRAVE]** `app/backend/src/services/gameService.ts:179` — À la création du salon : `data.gameMode === 'duel' ? 'duel' : 'classic'`. Les 6 autres modes du registre (escalade, complices, sudden_death, inverse, envies, petits_noms) proposés par `GameModeSelector` à la création sont **silencieusement dégradés en classique** ; seul le changement de mode en cours de partie (`mode:respond`, l. 677 qui accepte tout id du registre) permet de les jouer. Le registre est trahi à son point d'entrée. Action : `const mode = getGameMode(data.gameMode); roomSettings.set(..., { gameMode: mode.id })`.

2. **[GRAVE]** `gameService.ts:94-96` — Tout l'état de jeu vit en mémoire (`activeGames`, `playerConnections`, `roomSettings`). Au redémarrage du serveur pendant des parties : les timers, réponses en cours, index de question et gamification disparaissent, mais la room reste `status='playing'` en SQLite ; `room:reconnect` (l. 228-274) réussit alors (room trouvée, non finie) sans `gameState` → les deux joueurs atterrissent dans un salon zombie sans question ni fin de partie, jusqu'à expiration de session (4 h) ou cleanup à 7 jours. Action minimale : au boot, basculer toutes les rooms `playing` en `finished` ; cible : snapshot du GameState (table JSON ou Redis) + reprise, et adapter Socket.IO/Redis si multi-instance.

3. **[GRAVE]** `gameService.ts:1691` + `app/backend/src/models/question.ts:181-197` — Le mode inverse fait un `INSERT INTO questions` (**une question synthétique par manche**, `active=0`) pour satisfaire la FK de `answers.question_id` ; aucun nettoyage nulle part : `cleanupExpiredRooms` (database.ts:2878) ne supprime que des rooms, `deleteQuestion` n'est appelé que par l'admin. Le mode étant endless, la table `questions` croît sans borne et pollue l'admin et les stats. Action : job de purge des questions `active=0` non référencées par des answers récentes, ou table `synthetic_questions` dédiée avec TTL.

4. **[MOYEN]** Copie `shared/types.ts` → `backend/src/types.ts` — Choix d'architecture assumé nulle part (pas de commentaire « généré », pas de script) : c'est le contrat de protocole complet (30+ événements socket) qui repose sur un copier-coller à la main. Risque : divergence non détectée à la compilation = bugs runtime des deux côtés. Solution structurelle : monorepo workspaces avec package partagé consommé par les deux `tsconfig` (le frontend prouve déjà que l'import direct `../../shared/types` fonctionne).

5. **[MOYEN]** `app/frontend/src/pages/Game.tsx:169` — `const scoreless = currentMode === 'envies' || currentMode === 'petits_noms'` : fuite d'abstraction du registre côté client ; le prochain mode sans points exigera de retoucher Game.tsx. Action : ajouter un flag `scoreless: boolean` à `GAME_MODES`/`GameModeDefinition` et tester le flag.

6. **[MOYEN]** `gameService.ts:1490-1655` — La mécanique du duel (requestThemeChoice, resolveThemeChoice, timer de choix, champs `roundWinner/roundWinners/awaitingThemeFrom` dans le GameState central) vit dans le moteur, pas dans le mode : `gameModes.ts` ne décrit que la décision, le moteur porte l'implémentation d'un seul mode. Un futur mode à interaction propre (enchère, veto…) devra encore modifier gameService. Action : donner aux modes un point d'extension (hooks `onDecision`/état par mode) plutôt qu'un GameState partagé qui accumule les champs spécifiques.

7. **[MOYEN]** `gameModes.ts:115-124, 240, 262` — Les modes escalade/envies/petits_noms codent en dur des codes de catégories (`'sexy'`, `'swipe'`, `'petits_noms'`…) sans vérification d'existence au démarrage : si une catégorie est renommée/désactivée en base, le fallback silencieux de `applyModeDecision` (gameService.ts:1622-1636) sert des questions hors thème sans alerte. Action : valider la ladder au boot contre `getActiveCategories()` et loguer/refuser le mode si une catégorie manque.

8. **[MOYEN]** `gameModes.ts:74` — Le mode classic garde la sentinelle magique `questionCount === 50` = illimité, héritage encodé dans une valeur métier que l'UI peut légitimement choisir (bornes 5-50 dans gameService.ts:172) : choisir sciemment 50 questions bascule en partie sans fin à écart de 200 pts. Action : champ explicite `unlimited: boolean` dans les settings du salon.

9. **[MINEUR]** `gameService.ts:1520, 1681, 1686` — Mélange `sort(() => Math.random() - 0.5)` comme shuffle (biaisé) pour le tirage des thèmes et des leurres du mode inverse. Action : Fisher-Yates utilitaire partagé.

10. **[MINEUR]** `app/backend/src/database.ts:17` — better-sqlite3 synchrone sur l'event loop + fichier local : contrainte mono-instance implicite (cohérente avec les Maps en mémoire) mais non documentée ; tout passage à 2 instances casse rooms ET sockets. Action : documenter la contrainte single-node dans le README et prévoir l'adapter Redis socket.io le jour venu.
