# Débat — Réponse de l'auditeur cybersécurité

## 1) Constats que je conteste ou nuance

- **Tech Lead #8 (`room:reconnect` réutilisé pour la validation de session, ping toutes les 5 min).** Le Tech Lead le voit comme un bug d'« événements fantômes ». C'est bien plus grave côté sécu : ce ping garde en vie une session detournable (mon constat 4) et, surtout, sa recommandation de créer un `room:ping` « idempotent en lecture seule » doit IMPÉRATIVEMENT exiger le même secret de session que le reconnect — sinon on crée un 2ᵉ endpoint d'énumération de salons non authentifié. À corriger ensemble, pas séparément.

- **Archi #2 (état en mémoire, salon zombie au reboot).** D'accord sur le fond, mais leur « action minimale : basculer les rooms `playing`→`finished` au boot » a un effet de bord sécu positif non mentionné : elle ferme aussi la fenêtre où `room:reconnect` réussit sur un salon sans `gameState`. Leur cible (snapshot Redis) NE doit PAS sérialiser en clair les réponses libres / surnoms / confessions (cf. §2). À nuancer : le snapshot devient une nouvelle surface de données sensibles.

- **Tech Lead #3 (ack sur `game:answer`).** Je soutiens, mais j'ajoute que l'ack est aussi le bon endroit pour appliquer la validation type/longueur que je réclame (mon constat 7) : sans ça, l'ack renvoie « accepted » sur un payload de 500 Ko. La reco UX et la reco sécu convergent sur le même point de code.

- **Archi #3 (questions synthétiques mode inverse, INSERT sans purge).** Le voit comme dette/pollution admin. Dimension sécu manquée : c'est un **INSERT non borné déclenché par le jeu** = vecteur de DoS de stockage (croissance SQLite illimitée en mode endless), à rapprocher de mon constat 7. Priorité relevée.

## 2) Implications sécurité de LEURS recommandations qu'ils n'ont pas vues

- **Coach « mode confession / questions sans révélation obligatoire ».** Ces réponses (intimes, sexuelles cat. `coquin`/`sexy`, confessions) transitent par `game:answer` et sont écrites **en clair** dans SQLite : table `answers.answer TEXT` (game.ts:42-49) ET, pour le mode inverse, dupliquées en clair dans `questions.text` (question.ts:181-197). Aucun chiffrement au repos, aucune purge : `cleanupExpiredRooms` ne supprime que des rooms, jamais les `answers`. Un dump de la base = historique intime permanent de tous les couples. Toute feature « confession » AGGRAVE ce stock. Recommandation : purge des `answers` à la fin de partie + chiffrement au repos si on garde un historique.

- **Récap lobby / historique de chat (GameChat, `lobby:chat`).** Les messages sont diffusés à la room mais aussi rejoués au reconnect ; combiné à `room:reconnect` non authentifié (constat 4), un tiers connaissant le code 4 chiffres rejoint la salle et **lit le chat et les réponses** des deux joueurs. Le récap n'est protégé que par le code de salon énumérable.

- **Talkie-walkie WebRTC (`voice:offer/answer/ice-candidate`).** Le serveur relaie les payloads de signalisation **sans aucune validation** (gameService.ts:908-925) vers « l'autre joueur de la room » — c.-à-d. vers quiconque a détourné le slot via reconnect. Les ICE candidates exposent les IP/réseau local des joueurs à un intrus qui a rejoint la salle. Le média est P2P, donc une fois la session ICE établie avec l'intrus, il obtient l'IP réelle du partenaire. Recommandation : n'établir le canal voice qu'après authentification de session, valider le shape des payloads, envisager un TURN relais pour masquer les IP.

## 3) TOP 5 absolu (JWT/hash/mdp admin déjà corrigés, exclus)

1. **[Sécu #4] `room:reconnect` sans preuve d'appartenance** (gameService.ts:220-267) — n'importe qui avec le code prend le slot d'un joueur : détournement de partie, lecture chat/réponses/voice. Racine de presque toutes les fuites de données ci-dessus.
2. **[Sécu #5] Codes de salon à 4 chiffres** (room.ts:4-8) — 10 000 combinaisons énumérables ; transforme le #4 d'attaque ciblée en balayage automatisé de tous les salons actifs.
3. **[Sécu #6] Aucun rate-limiting socket** (buzz/kiss/reaction/chat/answer + voice relay) — DoS applicatif trivial et amplification (maxHttpBufferSize par défaut 1 Mo, non configuré).
4. **[Sécu #7 + Archi #3] Écritures non bornées déclenchées par le jeu** — `game:answer` sans limite de taille/type ET INSERT de questions synthétiques sans purge : croissance illimitée de SQLite, DoS de stockage.
5. **[Sécu #8/#9] CORS ouvert (Express `cors()` + Socket.IO `origin:true`)** — toute origine tierce peut ouvrir une socket vers le jeu et frapper l'API admin ; élargit l'exploitabilité de tous les points ci-dessus depuis un site attaquant.
