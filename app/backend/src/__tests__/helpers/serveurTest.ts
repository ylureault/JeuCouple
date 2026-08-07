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

/** Ecoute sur le port demande, ou sur un port ephemere s'il est deja pris. */
function ecouter(http: HttpServer, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const surErreur = (erreur: NodeJS.ErrnoException) => {
      if (erreur.code !== 'EADDRINUSE') { reject(erreur); return; }
      http.removeListener('error', surErreur);
      http.once('error', reject);
      http.listen(0, () => resolve((http.address() as { port: number }).port));
    };
    http.once('error', surErreur);
    http.listen(port, () => {
      http.removeListener('error', surErreur);
      resolve((http.address() as { port: number }).port);
    });
  });
}

export async function demarrerServeur(port: number): Promise<HarnaisServeur> {
  const { setupSocketHandlers } = await import('../../services/gameService.js');
  const http = createServer();
  const io = new SocketIOServer(http, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });
  setupSocketHandlers(io as never);

  // Chaque suite a son port dedie ; si un reliquat d'execution le retient
  // encore, on bascule sur un port ephemere plutot que d'echouer.
  const portEffectif = await ecouter(http, port);

  return {
    io,
    http,
    port: portEffectif,
    url: `http://127.0.0.1:${portEffectif}`,
    async fermer() {
      // 1. Les parties d'abord. Une partie en cours garde des minuteurs qui
      //    survivent a la fermeture du serveur : ils se reveillaient apres la
      //    fin de la suite et journalisaient dans le vide, ce que Jest refuse
      //    (« Cannot log after tests are done ») et compte comme un echec.
      const { arreterToutesLesParties } = await import('../../services/gameService.js');
      arreterToutesLesParties();

      // 2. Les clients : on coupe les ecouteurs AVANT de deconnecter, sinon un
      //    evenement en vol reveille encore du code de test.
      for (const c of clientsOuverts.splice(0)) {
        c.removeAllListeners();
        c.disconnect();
      }

      // 3. Le serveur, en ATTENDANT sa fermeture. `io.close()` sans rappel
      //    rendait la main avant que les sockets soient reellement soldes.
      //    io.close() ferme aussi le serveur http sous-jacent : on ne repasse
      //    par http.close() que s'il ecoute encore.
      await new Promise<void>(resolve => io.close(() => resolve()));
      if (http.listening) {
        await new Promise<void>(resolve => http.close(() => resolve()));
      }
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
