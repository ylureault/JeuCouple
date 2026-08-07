# Livrer sur ce projet — mode d'emploi

Document destiné à toute personne (ou agent) qui reprend le développement.
Il existe parce que cette session a produit trois erreurs de méthode coûteuses,
détaillées plus bas. Les éviter fait gagner des heures.

---

## 1. La règle qui prime sur tout

**Ne jamais annoncer « c'est corrigé » sans l'avoir exécuté.**

Compiler n'est pas vérifier. Des tests verts ne sont pas une preuve. La seule
preuve acceptable est : le vrai serveur démarré, de vrais clients connectés,
le comportement observé.

Trois exemples vécus, tous découverts par l'utilisateur en production alors que
tout était « vert » :

- **28/28 tests au vert** pendant que le jeu plantait. Les deux suites
  historiques (`gameSimulation`, `stabilityTests`) n'importaient **aucune ligne**
  du code de production : elles réimplémentaient leurs propres handlers socket et
  testaient ce mock. Supprimées.
- **Corriger un fichier de questions ne corrige pas la base.** `import-thematic`
  saute toute question dont `(texte, catégorie)` existe déjà. Une base déjà
  peuplée garde donc l'ancienne version **pour toujours**. Tout correctif de
  contenu doit s'accompagner d'une **migration** dans `database.ts`
  (voir `fixQuestionInputTypes`, `mergeLegacyCategories`).
- **Un bug d'affichage peut venir du modèle.** Des manches entières sans aucun
  bouton : `rowToQuestion` lisait 10 colonnes sur 12, `emoji_a`/`emoji_b`
  tombaient dans le vide.
- **`\b` ne connaît pas les accents.** Il raisonne sur `[A-Za-z0-9_]`, donc il
  voit une frontière de mot au milieu de « mètres » et de « rencontrés il ».
  `fixMissingAccents` a ainsi écrit « mètrès », « rencontrés'il » et
  « ami(e)s'en » — 62 questions abîmées. Toute expression régulière appliquée au
  corpus s'écrit désormais avec `\p{L}` et le drapeau `u` (helper `mot()` dans
  `database.ts`), jamais avec `\b`. Un correctif de contenu qui abîme le contenu
  coûte plus cher que le défaut qu'il visait : `fixDegatsAccents()` répare les
  bases déjà installées, et un test rejoue l'aller-retour sur tout le corpus.

---

## 2. Vérifier avant de livrer

Dans cet ordre, à chaque fois :

```bash
# 1. Compilation
cd app/backend  && npx tsc --noEmit
cd app/frontend && npx tsc --noEmit && npx vite build

# 2. Tests (séquentiel : en parallèle, les suites se disputent ports et base)
#    Le drapeau ESM est indispensable : sans lui, 18 suites ne compilent même
#    pas (TS1343 sur `import.meta`) et jest annonce quand même « 366 passed ».
cd app/backend && NODE_OPTIONS='--experimental-vm-modules' npx jest --runInBand
#    ou simplement : npm test

# 3. Parties réelles, 10 modes, ~223 scénarios
cd app/backend && npm run test:gameplay
#    ciblé : npm run test:gameplay -- --filter=duel

# 4. Intégrité du contenu après import
DATABASE_PATH=/tmp/v.sqlite npx tsx src/import-thematic.ts   # 0 erreur attendue
```

Pour un comportement visible à l'écran, piloter un vrai navigateur :
Chromium est en `/opt/pw-browsers/chromium`, à lancer avec
`args: ['--no-proxy-server']`. Servir le front par le backend
(`NODE_ENV=production`, copier `app/frontend/dist/*` dans `public_html/`).

**Ne jamais committer si le typecheck est rouge**, même quand un agent voisin
est en cours d'édition. Committer les fichiers sûrs, laisser les autres.

---

## 3. Ajouter des questions

### Format
Un fichier par lot dans `app/backend/data/`, structure `{"questions": [...]}`,
**une question par ligne** (les diffs restent lisibles).

```json
{"type": "H", "category": "culture", "text": "…", "options": ["…","…","…","…"], "correct_answer": "…", "timer": 20}
```

### Ce que chaque type exige — sinon la question est injouable
`isPlayable()` dans `app/backend/src/models/question.ts` fait foi :

| Type | Rendu | Champs obligatoires |
|---|---|---|
| A, B | QCM | `options` ≥ 2 |
| H | Culture G | `options` ≥ 2 **+** `correct_answer` **présent dans** `options` |
| C | Texte libre | — |
| D, Q, K | Curseur 1‑10 | — |
| E, L | Choix binaire | `option_a` **et** `option_b` |
| I | Choix visuel | `option_a`, `option_b`, **`emoji_a`, `emoji_b`** |
| F | Qui de nous deux | — |
| G | Vrai / Faux | — |
| S | Opinion tranchée | — |
| N | Plus / Moins | `reference_value` **et** le même nombre écrit dans l'énoncé |

Le client dessine deux boutons PLUS / MOINS mais **n'affiche jamais**
`reference_value` : sans le nombre dans le texte, la question devient « plus ou
moins que quoi ? ». Un test l'interdit.

Piège fréquent : **l'énoncé doit correspondre au type**. « Décris… » sur un
curseur 1‑10 est inrépondable ; « Sur 10, note… » dans un champ texte aussi.
Un test l'interdit.

### Catégorie
Elle doit exister dans `initDefaultCategories()` (`database.ts`). Sinon la
question part en base mais reste **injouable** : le sélecteur de thèmes ne liste
que la table `categories`. L'import refuse désormais une catégorie inconnue.

Attention aux codes de catégorie cités **hors du serveur** : l'échelle du
curseur d'intensité (`PALIERS_TORRIDES` dans `Home.tsx`) les nomme en dur.
Renommer une catégorie sans toucher cette liste ouvrirait un cran du curseur
sur un vivier vide. `contenu.intensite-torride.test.ts` lit la source du front
et confronte chaque palier au catalogue — il casse si les deux divergent.

### Vérifier son lot
```bash
cd app/backend && NODE_OPTIONS='--experimental-vm-modules' \
  npx jest --runInBand src/__tests__/questionData.test.ts src/__tests__/contenu.elisions.test.ts
```
Ces tests contrôlent : catégories enregistrées, champs par type, bonne réponse
présente parmi les options, options non dupliquées, **unicité des énoncés**,
accents, minuteur exploitable.

### L'import doit rester stable
Le fichier source et la base doivent dire **exactement** la même chose. Si une
migration réécrit un énoncé, l'import ne le reconnaît plus et le réinsère — à
chaque déploiement. Le contrôle tient en deux lignes :

```bash
DATABASE_PATH=/tmp/v.sqlite npx tsx src/import-thematic.ts   # 1re passe
DATABASE_PATH=/tmp/v.sqlite npx tsx src/import-thematic.ts   # doit importer 0
```

La seconde passe qui importe autre chose que `0` désigne des questions dont le
texte est corrigé après coup : accentuer le fichier source, pas seulement la
base.

### Doublons
Toujours comparer au corpus **entier** avant de livrer, pas seulement à son
propre lot. Plusieurs agents écrivant en parallèle ont produit 51 doublons
qu'il a fallu retirer après coup. Le seed, lui, n'a jamais vérifié : il en
portait 53 de plus, dont « Dessus ou dessous ? » trois fois dans le même thème.
`deactivateDuplicateQuestions()` les désactive au démarrage (désactiver et non
supprimer : `answers.question_id` est en `ON DELETE CASCADE`, une suppression
effacerait des parties jouées). Et `getMixedQuestions()` dédoublonne par énoncé
au tirage, pour la trentaine de questions qui vivent légitimement dans deux
thèmes.

---

## 4. Ajouter un mode de jeu

Le registre `app/backend/src/services/gameModes.ts` est la seule source de
vérité des règles. Une définition suffit — ne pas disperser des
`if (mode === '…')` dans le moteur.

1. Définir le mode (`id`, `label`, `description`, `icon`, `endless`,
   `initialQuestionCount`, `afterRound`) et l'ajouter à `MODES`.
   **Oublier cette dernière ligne dégrade silencieusement le mode en
   « classic ».** C'est arrivé.
2. L'ajouter au catalogue `GAME_MODES` dans `app/shared/types.ts`, puis copier
   ce fichier vers `app/backend/src/types.ts` (miroir).
3. Si le mode restreint son périmètre (catégories/types imposés), passer par
   `enforceModeScope()` dans `gameService.ts` — appelé à la création **et** au
   changement de mode en cours de partie. Un mode qui **rétrécit** doit purger
   la file de questions déjà chargée, sinon il sert les questions de l'ancien.
4. Ajouter des scénarios dans `src/__tests__/gameplay/suites/`.

---

## 5. Principes de conception à ne pas casser

- **Le serveur fait foi.** Manche, question, scores et échéance absolue partent
  dans `game:round-state`. Le client affiche, il ne dérive rien.
- **La bonne réponse ne quitte jamais le serveur avant la révélation.** Elle est
  retirée de `game:question` (émission normale **et** reconnexion). La suite
  gameplay a besoin de la connaître pour vérifier le barème : elle la lit dans
  la base jetable du serveur, en lecture seule
  (`gameplay/harness/oracle.ts`) — **jamais** en la remettant dans la trame.
- **Consentement partout.** Le joueur 2 valide les réglages avant le lancement ;
  la montée de palier en Escalade exige l'accord des deux ; un changement de
  mode se propose et s'accepte.
- **Poser une limite est gratuit.** « Passer » ne coûte aucun point et ne casse
  pas la série. Un timeout vaut 0, jamais une pénalité. Le score est planché
  à 0 : jamais de score négatif affiché à quelqu'un.
- **Aucune question injouable ne doit être servie.** `isPlayable()` filtre au
  tirage.
- **Les confessions ne sont pas conservées.** Les réponses sont purgées en fin
  de partie (données intimes).

---

## 6. Bugs connus — les quatre sont corrigés

Trouvés par la suite gameplay, corrigés depuis. Gardés ici parce que chacun
laisse une règle à ne pas casser :

1. **Modes « sans points »** (corrigé) — `envies` affichait 253/250 en 3 manches.
   Le drapeau `scoreless` vit désormais dans le registre `gameModes.ts` (comme
   `endless`) et `revealAnswers()` remet à zéro base, bonus de rapidité, bonus
   de série, joker et micro-bonus anti-égalité en un seul endroit. Un test
   croise le registre et le catalogue `GAME_MODES` : les deux ne peuvent plus
   diverger. **Ne jamais tester un identifiant de mode en dur dans le moteur.**
2. **Question rejouée** (corrigé) — `gameState.answers` est indexé par
   `answerKey(question.id, index de manche)` et non plus par `question.id`.
   Quand le vivier est épuisé, une question qui revient ouvre une ardoise
   vierge. **Tout nouvel accès à `answers` passe par `answerKey()`.**
3. **Type N** (corrigé) — la colonne `reference_value` existe (migration dans
   `runMigrations`), elle est écrite par `import-thematic` / `createQuestion` /
   le seed, lue par `rowToQuestion`, et `fixTypeNReferenceValues()` répare les
   bases déjà installées en recopiant le nombre de l'énoncé. Le client n'affiche
   toujours pas ce nombre : il **doit** rester écrit dans le texte (cf. §3).
4. **Journalisation après la fin des tests** (corrigé) — ce n'étaient pas les
   sockets mais les **minuteurs de partie** (question, enchaînement, choix de
   thème, palier, délai de grâce) : fermer le serveur ne les annule pas.
   `arreterToutesLesParties()` les solde, et le harnais l'appelle dans
   `fermer()` avant d'attendre la vraie fermeture de `io` et du serveur HTTP.

Le reste des points ouverts vient de la recette utilisateur du 7 août 2026 :
sections **E1→E12** (cohérence des résultats, chat, pause) et **U1→U12**
(décalage de mise en page, transitions lentes, jauge de minuteur plein écran).
Cette recette est un excellent document de travail, à reprendre telle quelle.
