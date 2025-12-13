import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

// Initialize Express
const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: NODE_ENV === 'development'
      ? ['http://localhost:5174', 'http://localhost:3004']
      : true,
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(cors());
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
