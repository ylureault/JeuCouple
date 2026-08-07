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

---

## 2. Vérifier avant de livrer

Dans cet ordre, à chaque fois :

```bash
# 1. Compilation
cd app/backend  && npx tsc --noEmit
cd app/frontend && npx tsc --noEmit && npx vite build

# 2. Tests (séquentiel : en parallèle, les suites se disputent ports et base)
cd app/backend && npx jest --runInBand

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
| N | Plus / Moins | `reference_value` — **colonne absente en base, type mort** |

Piège fréquent : **l'énoncé doit correspondre au type**. « Décris… » sur un
curseur 1‑10 est inrépondable ; « Sur 10, note… » dans un champ texte aussi.
Un test l'interdit.

### Catégorie
Elle doit exister dans `initDefaultCategories()` (`database.ts`). Sinon la
question part en base mais reste **injouable** : le sélecteur de thèmes ne liste
que la table `categories`. L'import refuse désormais une catégorie inconnue.

### Vérifier son lot
```bash
cd app/backend && npx jest --runInBand src/__tests__/questionData.test.ts
```
Ces tests contrôlent : catégories enregistrées, champs par type, bonne réponse
présente parmi les options, options non dupliquées, **unicité des énoncés**,
accents, minuteur exploitable.

### Doublons
Toujours comparer au corpus **entier** avant de livrer, pas seulement à son
propre lot. Plusieurs agents écrivant en parallèle ont produit 51 doublons
qu'il a fallu retirer après coup.

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
  retirée de `game:question` (émission normale **et** reconnexion).
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

## 6. Bugs connus, non corrigés

Trouvés par la suite gameplay, documentés et laissés en l'état :

1. **Modes « sans points » qui marquent des points** — `envies` affiche 253/250
   en 3 manches, `petits_noms` 102/100, alors que le catalogue annonce l'absence
   de score. `gameService.ts` applique le barème sans regarder le drapeau
   `scoreless`.
2. **Question rejouée = manche bloquée** — les réponses sont indexées par
   `question.id` ; quand le vivier est épuisé et qu'une question revient, les
   nouvelles réponses sont refusées (« Réponse déjà enregistrée ») et l'ancien
   résultat est rejoué. Indexer par `(question.id, numéro de manche)`.
3. **Type N mort** — `isPlayable()` exige `reference_value`, colonne absente de
   la table `questions`. Les 4 questions concernées ne sortent jamais.
4. **Suite `etat-partie` instable** — journalise après la fin des tests
   (`Cannot log after tests are done`). Problème d'hygiène de test, pas de
   produit : nettoyer serveurs et sockets dans `afterAll`.

Le reste des points ouverts vient de la recette utilisateur du 7 août 2026 :
sections **E1→E12** (cohérence des résultats, chat, pause) et **U1→U12**
(décalage de mise en page, transitions lentes, jauge de minuteur plein écran).
Cette recette est un excellent document de travail, à reprendre telle quelle.
