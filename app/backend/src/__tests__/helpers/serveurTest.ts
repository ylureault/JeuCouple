import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import SocketIOClient from 'socket.io-client';

// Le paquet @types/socket.io-client installe decrit la v1 : on passe donc par
// l'export par defaut, comme les suites historiques du projet.
const ioc = SocketIOClient;

/** Type du client socket.io reel utilise par les suites fonctionnelles. */
export type ClientSocket = ReturnType<typeof ioc>;

/**
 * Harnais des tests fonctionnels.
 *
 * Point capital : on branche le VRAI `setupSocketHandlers` de production sur un
 * vrai serveur socket.io, et on parle avec de vrais clients socket.io-client.
 * Les anciennes suites reimplementaient leurs propres handlers et ne prouvaient
 * donc rien du code livre.
 *
 * `gameService` (et le registre de modes qu'il charge) est importe
 * DYNAMIQUEMENT : cela laisse a chaque suite la possibilite de poser ses
 * variables d'environnement (ESCALADE_PALIER_LEN...) avant le premier import.
 */

export interface HarnaisServeur {
  io: SocketIOServer;
  http: HttpServer;
  port: number;
  url: string;
  fermer(): Promise<void>;
}

const clientsOuverts: ClientSocket[] = [];

export async function demarrerServeur(port: number): Promise<HarnaisServeur> {
  const { setupSocketHandlers } = await import('../../services/gameService.js');
  const http = createServer();
  const io = new SocketIOServer(http, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });
  setupSocketHandlers(io as never);

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, resolve);
  });

  return {
    io,
    http,
    port,
    url: `http://127.0.0.1:${port}`,
    async fermer() {
      for (const c of clientsOuverts.splice(0)) {
        c.removeAllListeners();
        c.disconnect();
      }
      io.close();
      await new Promise<void>(resolve => http.close(() => resolve()));
    },
  };
}

/** Ouvre un client socket.io reel et attend sa connexion. */
export function connecter(serveur: HarnaisServeur, timeoutMs = 8000): Promise<ClientSocket> {
  const socket = ioc(serveur.url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: timeoutMs,
  });
  clientsOuverts.push(socket);
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new Error('Connexion socket impossible')), timeoutMs);
    socket.on('connect', () => { clearTimeout(minuteur); resolve(socket); });
    socket.on('connect_error', (e: Error) => { clearTimeout(minuteur); reject(e); });
  });
}

/** Emet un evenement et resout avec l'accuse de reception du serveur. */
export function emettreAvecAck<T>(
  socket: ClientSocket, evenement: string, donnees?: unknown, timeoutMs = 8000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(
      () => reject(new Error(`Aucun accuse de reception pour « ${evenement} »`)), timeoutMs);
    const rappel = (reponse: T) => { clearTimeout(minuteur); resolve(reponse); };
    if (donnees === undefined) socket.emit(evenement, rappel);
    else socket.emit(evenement, donnees, rappel);
  });
}

/** Attend la prochaine occurrence d'un evenement serveur. */
export function attendre<T>(socket: ClientSocket, evenement: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(
      () => reject(new Error(`Evenement « ${evenement} » jamais recu`)), timeoutMs);
    socket.once(evenement, (donnees: T) => { clearTimeout(minuteur); resolve(donnees); });
  });
}

/** Variante tolerante : rend null au lieu d'echouer quand rien n'arrive. */
export async function attendrePeutEtre<T>(
  socket: ClientSocket, evenement: string, timeoutMs = 800
): Promise<T | null> {
  return new Promise(resolve => {
    const minuteur = setTimeout(() => { socket.off(evenement, gestionnaire); resolve(null); }, timeoutMs);
    const gestionnaire = (donnees: T) => { clearTimeout(minuteur); resolve(donnees); };
    socket.once(evenement, gestionnaire);
  });
}

/** Enregistre toutes les occurrences d'un evenement pour analyse a posteriori. */
export function enregistrer<T>(socket: ClientSocket, evenement: string): T[] {
  const recus: T[] = [];
  socket.on(evenement, (donnees: T) => recus.push(donnees));
  return recus;
}

export const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
