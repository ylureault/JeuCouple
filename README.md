# Jeu Couples - Quiz Romantique en Temps Réel

Un jeu de quiz interactif pour couples inspiré de Kahoot. Testez à quel point vous connaissez votre partenaire !

## Fonctionnalités

- **Salons privés** : Code unique à 6 caractères pour rejoindre
- **4 types de questions** :
  - **Type A** : Devine ce que l'autre va répondre
  - **Type B** : Qui de nous deux ?
  - **Type C** : Réponse libre (discussion)
  - **Type D** : Échelle de 1 à 10
- **Interface Kahoot-like** : Countdown, animations, confettis
- **Temps réel** : WebSocket avec Socket.IO
- **Panel Admin** : Gestion des questions, import/export JSON
- **Mobile-first** : Optimisé pour smartphone

## Stack Technique

### Backend
- Node.js 20 + Express + TypeScript
- Socket.IO (temps réel)
- SQLite (better-sqlite3)
- JWT (authentification admin)

### Frontend
- React 18 + Vite + TypeScript
- TailwindCSS (styling)
- Framer Motion (animations)
- Socket.IO Client

## Installation

### Prérequis
- Node.js 20+
- npm ou yarn
- PM2 (pour la production)

### 1. Cloner et installer

```bash
cd /home/ylureault/web/[DOMAIN]
git clone [repo] app

# Backend
cd app/backend
cp .env.example .env
# Éditer .env avec vos valeurs
npm install
npm run build

# Frontend
cd ../frontend
npm install
npm run build

# Copier le build vers public_html
cp -r dist/* ../../public_html/
```

### 2. Configuration de la base de données

```bash
mkdir -p /home/ylureault/web/[DOMAIN]/data
mkdir -p /home/ylureault/web/[DOMAIN]/logs
```

La base de données SQLite est créée automatiquement au premier démarrage.

### 3. Variables d'environnement

Créer le fichier `/home/ylureault/web/[DOMAIN]/app/backend/.env` :

```env
PORT=3004
NODE_ENV=production
JWT_SECRET=votre-secret-jwt-tres-long-et-aleatoire
ADMIN_EMAIL=votre@email.com
ADMIN_PASSWORD=motdepasse-securise
DATABASE_PATH=/home/ylureault/web/[DOMAIN]/data/database.sqlite
```

### 4. Démarrer avec PM2

```bash
cd /home/ylureault/web/[DOMAIN]
pm2 start ecosystem.config.js
pm2 save
```

### 5. Configuration Apache

Ajouter le contenu de `apache-config.conf` à votre configuration vhost.

Modules requis :
```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers
sudo systemctl restart apache2
```

### 6. Importer les questions de démo

```bash
# Via l'interface admin
# Ou via curl :
TOKEN=$(curl -s -X POST http://localhost:3004/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"votre@email.com","password":"motdepasse"}' \
  | jq -r '.token')

curl -X POST http://localhost:3004/api/admin/questions/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d @questions-demo.json
```

## Utilisation

### Jouer

1. Accéder à `https://votre-domaine.com`
2. Joueur 1 : Créer une partie → Obtenir un code
3. Joueur 2 : Rejoindre avec le code
4. Lancer la partie !

### Administration

1. Accéder à `/admin/login`
2. Se connecter avec les identifiants définis dans `.env`
3. Gérer les questions, voir les statistiques

## Commandes utiles

```bash
# Voir les logs
pm2 logs jeu-couples

# Redémarrer
pm2 restart jeu-couples

# Arrêter
pm2 stop jeu-couples

# Statut
pm2 status

# Mise à jour
cd /home/ylureault/web/[DOMAIN]/app
git pull
cd backend && npm install && npm run build && cd ..
cd frontend && npm install && npm run build
cp -r frontend/dist/* ../public_html/
pm2 restart jeu-couples
```

## Structure des fichiers

```
/home/ylureault/web/[DOMAIN]/
├── app/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── database.ts
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   └── middleware/
│   │   ├── dist/
│   │   ├── package.json
│   │   └── .env
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── context/
│   │   │   └── ...
│   │   ├── dist/
│   │   └── package.json
│   └── shared/
│       └── types.ts
├── public_html/        # Build React (servi par Apache)
├── data/
│   └── database.sqlite
├── logs/
├── ecosystem.config.js
└── apache-config.conf
```

## API Endpoints

### WebSocket Events

**Client → Server**
- `room:create` - Créer un salon
- `room:join` - Rejoindre un salon
- `room:leave` - Quitter le salon
- `game:start` - Lancer la partie (host uniquement)
- `game:answer` - Envoyer une réponse

**Server → Client**
- `room:joined` - Confirmation de connexion
- `room:player-joined` - Un joueur a rejoint
- `room:player-left` - Un joueur a quitté
- `game:started` - La partie commence
- `game:question` - Nouvelle question
- `game:player-answered` - L'autre joueur a répondu
- `game:reveal` - Révélation des réponses
- `game:score-update` - Mise à jour du score
- `game:finished` - Fin de partie

### REST API (Admin)

- `POST /api/admin/login` - Connexion admin
- `GET /api/admin/stats` - Statistiques dashboard
- `GET /api/admin/questions` - Liste des questions
- `POST /api/admin/questions` - Créer une question
- `PUT /api/admin/questions/:id` - Modifier une question
- `DELETE /api/admin/questions/:id` - Supprimer une question
- `POST /api/admin/questions/import` - Importer des questions
- `GET /api/admin/questions/export/all` - Exporter les questions
- `GET /api/admin/rooms` - Liste des salons
- `DELETE /api/admin/rooms/:id` - Supprimer un salon

## Format JSON des questions

```json
{
  "questions": [
    {
      "type": "A",
      "category": "habitudes",
      "text": "Quel est son plat préféré ?",
      "options": ["Pizza", "Sushi", "Burger", "Pâtes"],
      "timer": 20
    },
    {
      "type": "C",
      "category": "souvenirs",
      "text": "Meilleur souvenir de vacances ?",
      "timer": 45
    },
    {
      "type": "D",
      "category": "couple",
      "text": "Niveau de satisfaction de 1 à 10 ?",
      "timer": 20
    }
  ]
}
```

### Types de questions

| Type | Description | Options | Scoring |
|------|-------------|---------|---------|
| A | Devine l'autre | 4 choix | Points si match |
| B | Qui de nous deux | 4 choix | Points si même réponse |
| C | Réponse libre | - | Pas de score |
| D | Échelle 1-10 | - | Points selon écart |

### Catégories disponibles

- `couple` - Relations et sentiments
- `sexy` - Vie intime
- `coquin` - Questions épicées
- `habitudes` - Vie quotidienne
- `souvenirs` - Mémoires communes
- `projets` - Futur ensemble
- `communication` - Dialogue
- `humour` - Fun et léger

## Dépannage

### Le WebSocket ne se connecte pas
- Vérifier que `mod_proxy_wstunnel` est activé
- Vérifier les règles de firewall pour le port 3004

### Erreur CORS
- Vérifier la configuration CORS dans le backend
- Vérifier les headers Apache

### Base de données verrouillée
- Un seul process doit accéder à SQLite
- Redémarrer PM2 si nécessaire

## Licence

MIT
