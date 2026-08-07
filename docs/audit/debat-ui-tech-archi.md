# Débat — position UI designer / tech lead / architecte

## 1. Ce que je conteste ou nuance chez les autres

- **Coach n°4 (validation de palier Escalade) et n°5 + UX n°1 (récap/consentement au lobby)** : légitimes sur le fond, mais chiffrez le coût réel. La « validation des deux joueurs à chaque palier » = un nouveau protocole d'accord mutuel (proposition + double ack + timeout + reconnexion en plein vote) à câbler dans un gameService de 1997 lignes qui gère déjà mal ses timers, et dans un GameContext de 1038 lignes où chaque événement re-rend tout. C'est exactement la mécanique de `mode:propose`/`mode:respond` qu'il faudrait généraliser — donc à faire APRÈS ma découpe TL-1/TL-2, sinon on ajoute un 4e demi-protocole ad hoc. Le récap lobby, lui, est bon marché (les settings existent dans `roomSettings`, il manque un emit) : je le prends tôt.
- **Coach n°4, nuance supplémentaire** : inutile de bâtir le double consentement tant que mon ARCHI-1 n'est pas corrigé — `gameService.ts:179` dégrade Escalade en classic à la création. Ils ont audité un mode que les joueurs ne peuvent même pas lancer depuis l'écran de création. Leur constat reste valable via `mode:respond`, mais la priorité est le bug, pas la feature.
- **Coach n°3 / UX n°2 (Joker)** : d'accord, mais la solution « bouton Passer gratuit sur tous les types » est une décision de *scoring serveur* (calculateBasePoints + streaks + anti-tie), pas un bouton front. À spécifier dans `scoring.ts` après extraction, sinon on retombe dans le bloc type C déjà incohérent (TL-10).
- **UX n°6 (bouton « on a fini de comparer » validé par les deux)** : je conteste le rapport coût/valeur — encore un protocole de double ack + gel de `scheduleNextQuestion` ; un simple décompte visible (déjà proposé) couvre 90 % du besoin pour 5 % du coût.
- **Sécu n°8/9 (CORS)** : vrai mais surclassé — tant que n°1/n°3 (secret JWT + admin123 par défaut) existent, l'attaquant n'a pas besoin de cross-origin. À corriger ensemble en une PR « durcissement », pas en chantier séparé.
- **Sécu n°6 (rate-limiting)** : je le reclasse en dépendance de mon TL-2 : le token bucket par socket se pose proprement dans `socialHandlers.ts` extrait, pas saupoudré dans le monolithe.

## 2. Conflits et ordre de chantier imposé

Conflit central : Coach/UX veulent des **features de consentement et d'affichage**, Sécu veut du **durcissement**, moi du **refactor**. Les trois tirent sur les deux mêmes fichiers-monolithes. Ordre imposé :

1. **Correctifs secs, sans refactor (semaine 1)** : Sécu 1-2-3 (secrets/admin), Sécu 5+4 (codes 4 chiffres + reconnect sans jeton — le jeton de session règle aussi mon TL-8), Sécu 7 (borner `game:answer`), mon ARCHI-1 (une ligne), UX n°4 (flag `endless` déjà présent), UX n°2 partie « masquer joker en scoreless » via le flag `scoreless` (ARCHI-5).
2. **Refactor structurel (semaines 2-3)** : TL-1 (découpe GameContext), TL-2 (découpe gameService), ARCHI-4/TL-6 (types partagés en workspace), TL-7 (fuite roomSettings), ARCHI-2 (rooms zombies au boot), ARCHI-3 (purge questions synthétiques). Le rate-limiting Sécu n°6 atterrit ici.
3. **Features de contenu/consentement (semaine 4+)** : récap lobby + accord joueur 2 (Coach 5/UX 1), passer gratuit (Coach 3), validation de palier (Coach 4) — bâties sur le protocole d'accord mutuel généralisé issu du refactor. Révision éditoriale des questions (Coach 1-2, 7-12) en parallèle : c'est de la donnée, zéro dépendance code.
4. **Dette UI (continu)** : mes UI 1-2-3 par écran, en même temps que chaque composant touché.

Features avant refactor = non. Une exception : le récap lobby, assez isolé pour passer en phase 1 si le produit l'exige.

## 3. TOP 5 absolu (tous rapports confondus)

1. **Sécu n°1+3 (JWT par défaut + admin123)** : compromission admin totale, exploitable aujourd'hui par n'importe qui, correctif d'une heure.
2. **Sécu n°4+5 (reconnect sans preuve + codes 4 chiffres)** : un tiers énumère 10 000 codes et s'assoit dans l'intimité d'un couple — c'est la pire violation possible pour CE produit.
3. **Mon ARCHI-1 (`gameService.ts:179`)** : 6 modes sur 8 silencieusement inaccessibles à la création — le cœur du produit annoncé ne fonctionne pas.
4. **Coach n°3 + UX n°2 (pénaliser la pose d'une limite)** : un jeu sexuel qui fait payer 50 points le refus de répondre est un défaut d'éthique produit, pas un détail UX.
5. **Mon ARCHI-2 (état en mémoire, rooms zombies)** : chaque déploiement casse toutes les parties en cours sans message — fiabilité de base avant toute nouvelle feature.
