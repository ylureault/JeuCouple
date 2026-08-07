import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase, cleanupExpiredRooms } from './database.js';
import { initializeAdminIfNeeded } from './models/admin.js';
import { setupSocketHandlers } from './services/gameService.js';
import adminRouter from './routes/admin.js';

import type {
  ServerToClientEvents,
  ClientToServerEvents
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3004;
const NODE_ENV = process.env.NODE_ENV || 'development';

// P1-9 (audit securite) : origines autorisees en liste blanche.
// L'ancien reglage etait origin:true en prod (toutes origines) + cors() ouvert.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);
// localhost ET 127.0.0.1 pour chaque port : un navigateur sur 127.0.0.1:5173
// etait rejete par la liste (l'ack socket se perdait silencieusement).
const DEV_PORTS = [5173, 5174, 4173, 3004];
const DEV_ORIGINS = DEV_PORTS.flatMap(p => [`http://localhost:${p}`, `http://127.0.0.1:${p}`]);
const corsOrigins = NODE_ENV === 'development'
  ? [...DEV_ORIGINS, ...ALLOWED_ORIGINS]
  : ALLOWED_ORIGINS;   // vide = aucune origine croisee (front servi ici meme)

// Initialize Express
const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  maxHttpBufferSize: 100_000,  // audit securite : 100 Ko couvrent large (SDP ~10 Ko)
  cors: {
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
// helmet : en-tetes de durcissement + CSP. Le front (Vite) n'embarque aucun
// script inline ; les styles compiles et Google Fonts sont explicitement permis.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,  // WebRTC/audio inter-origine
}));
app.use(cors(corsOrigins.length > 0 ? { origin: corsOrigins } : { origin: false }));
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/admin', adminRouter);

// Serve static files in production
if (NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, '../../../public_html');
  app.use(express.static(publicPath));

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Initialize database
initDatabase();
initializeAdminIfNeeded();

// Setup Socket.IO handlers
setupSocketHandlers(io);

// Cleanup expired rooms periodically
setInterval(cleanupExpiredRooms, 60 * 60 * 1000); // Every hour

// Start server
httpServer.listen(PORT, () => {
  console.log(`🎮 Jeu Couples server running on port ${PORT}`);
  console.log(`📡 Environment: ${NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
