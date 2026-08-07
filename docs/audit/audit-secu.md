# Audit Cybersécurité — JeuCouple (backend Node/Express/Socket.IO/SQLite + frontend React)

Date : 2026-08-07. Périmètre : `app/backend/src/`, `app/frontend/src/`. Aucun fichier modifié.
Constats classés par gravité décroissante. Chaque constat = faits vérifiés dans le code.

---

## Constats

**1. [CRITIQUE] `middleware/auth.ts:4` — Secret JWT en dur avec défaut faible.**
`const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'` : si la variable d'env n'est pas définie (aucun `.env` fourni, défaut silencieux), le secret est public et connu, donc n'importe qui peut forger un token admin valide (`jwt.sign({adminId:1}, 'your-secret-key-change-in-production')`) et accéder à toutes les routes `/api/admin/*`.
*Correctif : refuser le démarrage si `process.env.JWT_SECRET` est absent ou trop court ; générer un secret aléatoire fort (32+ octets) et le charger uniquement depuis l'environnement.*

**2. [CRITIQUE] `models/admin.ts:10-12` — Mot de passe admin haché en SHA-256 sans sel.**
`hashPassword` fait `crypto.createHash('sha256').update(password).digest('hex')` : hash rapide, non salé, vulnérable aux rainbow tables et au bruteforce GPU ; la comparaison `admin.password_hash === hash` (ligne 27) n'est pas non plus à temps constant.
*Correctif : remplacer par bcrypt/scrypt/argon2 avec sel par utilisateur et comparaison à temps constant.*

**3. [CRITIQUE] `models/admin.ts:37-40` — Compte admin par défaut avec identifiants triviaux.**
`initializeAdminIfNeeded` crée au démarrage (log « Admin account created » ligne 40) un compte `admin@example.com` / `admin123` si `ADMIN_EMAIL`/`ADMIN_PASSWORD` ne sont pas définis. En production sans variables d'env, l'admin est accessible avec des identifiants publics connus.
*Correctif : exiger `ADMIN_EMAIL`/`ADMIN_PASSWORD` à la création, refuser un mot de passe par défaut/faible, forcer un changement au premier login.*

**4. [ÉLEVÉ] `services/gameService.ts:220-267` — `room:reconnect` sans preuve d'appartenance.**
Le handler ne vérifie que : code de salle existant, statut ≠ finished, et présence d'un `player1_name`/`player2_name` (ligne 242-246). Aucun secret/token de session n'est requis : quiconque connaît le code peut se reconnecter comme `playerId` 1 ou 2 de n'importe quelle salle, prendre la place du joueur légitime (le code « clean up stale connections » ligne 251-261 expulse même la connexion existante) et lire/injecter dans la partie.
*Correctif : émettre un jeton de session secret à la création/jonction, le stocker côté client, et l'exiger + vérifier au `room:reconnect`.*

**5. [ÉLEVÉ] `models/room.ts:4-8` — Codes de salle à 4 chiffres, énumérables.**
`generateCode` produit un entier 0000-9999 (10 000 combinaisons). Combiné au constat 4 (reconnexion sans secret) et à l'absence de rate-limiting socket (constat 6), un attaquant peut énumérer tous les codes actifs et rejoindre/détourner les parties en cours en quelques minutes.
*Correctif : codes plus longs et alphanumériques (≥ 6 caractères), plus limitation/backoff sur les tentatives de jonction et reconnexion.*

**6. [ÉLEVÉ] `services/gameService.ts` (handlers `game:buzz` l.831, `game:kiss` l.853, `game:reaction` l.762, `game:sound-reaction` l.797, `game:text-reaction` l.778, `game:quick-message` l.814, `lobby:chat` l.882) — Aucun rate-limiting.**
Tous ces handlers rediffusent immédiatement à toute la salle (`io.to(...).emit`) sans throttle ni quota par socket. Un client peut spammer des milliers d'événements/seconde (buzz/kiss/réactions) pour saturer le partenaire et le serveur (DoS applicatif). `maxHttpBufferSize` n'est pas configuré dans `index.ts`, donc le défaut Socket.IO de 1 Mo/message s'applique — amplification possible.
*Correctif : appliquer un rate-limiter par socket et par type d'événement (ex. token bucket), et réduire `maxHttpBufferSize`.*

**7. [ÉLEVÉ] `services/gameService.ts:508-561` — `game:answer` sans validation de type ni de longueur.**
`data.answer` est stocké tel quel en mémoire (l.547/550) puis inséré en base via `gameModel.saveAnswer` (l.556-561) sans vérifier que c'est une chaîne ni borner sa taille (contrairement à `lobby:chat` qui fait `.trim().slice(0,200)` l.894). Un joueur peut envoyer une chaîne de plusieurs centaines de Ko à chaque question, gonflant la base SQLite (`answers.answer TEXT NOT NULL`) et la charge de diffusion — DoS de stockage.
*Correctif : valider `typeof data.answer === 'string'` et tronquer (ex. `.slice(0, 500)`) avant stockage/diffusion.*

**8. [MOYEN] `index.ts:42` — CORS Express ouvert à toutes les origines.**
`app.use(cors())` sans options renvoie `Access-Control-Allow-Origin` reflétant n'importe quelle origine sur toutes les routes, dont `/api/admin/*`. Couplé à un token en localStorage côté SPA, cela élargit la surface d'attaques cross-origin sur l'API admin.
*Correctif : restreindre `cors()` à une liste blanche d'origines (domaine de prod) et n'exposer que les méthodes nécessaires.*

**9. [MOYEN] `index.ts:30-36` — CORS Socket.IO `origin: true` en production.**
En production, la config Socket.IO utilise `origin: true`, ce qui autorise toute origine à ouvrir une connexion WebSocket vers le jeu (jonction/reconnexion depuis n'importe quel site tiers).
*Correctif : fixer `origin` à la liste blanche du domaine de production au lieu de `true`.*

**10. [FAIBLE] `middleware/auth.ts:11` — Expiration de token 24h, pas de révocation.**
Les tokens admin vivent 24h (`expiresIn: '24h'`) sans mécanisme de révocation ni rotation ; un token volé reste valable une journée entière.
*Correctif : réduire la durée de vie, ajouter un refresh token et une liste de révocation, ou lier le token à un identifiant de session serveur.*

**11. [FAIBLE] `index.ts` — En-têtes de sécurité HTTP absents (pas de Helmet).**
Aucun middleware type `helmet` : pas de CSP, `X-Content-Type-Options`, `X-Frame-Options`, HSTS. La SPA servie en prod (l.54-62) et l'API sont exposées au clickjacking et au sniffing MIME.
*Correctif : ajouter `helmet()` avec une CSP adaptée.*

---

## Points vérifiés SANS vulnérabilité (contrôles réalisés)

- **Injection SQL — CLEAN.** Toutes les requêtes de `models/*.ts` et `database.ts` utilisent des requêtes préparées avec placeholders `?`. Les cas dynamiques ont été inspectés :
  - `models/question.ts:242` (`updateQuestion`) : les fragments `type = ?`, `category = ?`… sont des noms de colonnes en dur issus d'une liste fixe de champs ; seules les valeurs passent par `?`. Pas de concaténation de données utilisateur.
  - `models/category.ts:103` et `models/questionType.ts:111` : même schéma (colonnes en dur, valeurs paramétrées).
  - `models/room.ts:63-71` (`removePlayerFromRoom`) : `nameField`/`genderField` proviennent d'un ternaire `playerId === 1 ? ... : ...`, jamais d'une entrée libre.
  - `models/question.ts:76-140` (`getMixedQuestions`) : clauses `IN (...)` construites avec des placeholders `?` par élément ; l'unique `join(',')` sans placeholder (l.135, `id NOT IN (...)`) concatène des `row.id` numériques issus de la base, pas d'entrée utilisateur.
  → Aucune injection SQL exploitable trouvée.

- **XSS — CLEAN (React).** Aucun `dangerouslySetInnerHTML` dans `app/frontend/src`. Les chaînes venant de l'autre joueur (réponses libres type C, messages `GameChat.tsx` l.59/81, prénoms, surnoms du mode `petits_noms`) sont rendues comme texte JSX, donc échappées par React. Les seuls passages dans une URL/attribut (`Game.tsx:266`, `Results.tsx:587`, `Lobby.tsx:104`) passent par `encodeURIComponent`. Pas de sink XSS identifié.

- **Autorisation de jeu partielle — OK.** `game:start` vérifie que l'appelant est bien player 1 (l.430) et que la salle est prête ; `duel:choose-theme` vérifie `awaitingThemeFrom === playerId` (l.696) et l'existence de la catégorie (l.698) ; `mode:respond` vérifie que le répondeur n'est pas l'émetteur de la proposition (l.658). Ces contrôles sont corrects. La faiblesse d'autorisation réside dans `room:reconnect` (constat 4), pas dans ces handlers.

- **Validation des entrées socket — état des lieux :**
  - Validés : `room:reconnect` (type/valeur playerId l.223), `mode:propose` (`typeof data.mode === 'string'` l.623 + mode existant), `duel:choose-theme` (l.697-698), `game:reaction`/`text-reaction`/`sound-reaction`/`quick-message` (id vérifié contre une liste blanche), `lobby:chat` (longueur bornée à 200 l.894).
  - NON validés (type et/ou longueur) : `game:answer` (`data.answer`, constat 7), `game:hesitation` (`data.isHesitating` non typé), `voice:offer`/`voice:answer`/`voice:ice-candidate` (payload WebRTC relayé tel quel au partenaire sans validation — relais aveugle, à borner). Ces relais voice sont un vecteur de spam/DoS mineur, couvert par le constat 6 (rate-limiting global manquant).
