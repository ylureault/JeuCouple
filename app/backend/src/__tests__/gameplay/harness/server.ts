/**
 * Lance le VRAI serveur de jeu, sur une base SQLite jetable et un port dedie.
 *
 * Rien n'est simule : `npx tsx src/index.ts` est demarre comme en production,
 * avec sa propre base peuplee par l'import thematique. La base et les journaux
 * vivent dans un repertoire temporaire supprime a la fin de la suite.
 */
import { spawn, type ChildProcess } from 'child_process';
import { createServer } from 'net';
import { mkdtempSync, rmSync, openSync, closeSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** .../src/__tests__/gameplay/harness -> racine du backend */
export const BACKEND_ROOT = path.resolve(__dirname, '../../../..');

export interface TestServer {
  url: string;
  port: number;
  dbPath: string;
  logPath: string;
  /** Reglages de cadence des modes, imposes par variables d'environnement. */
  escaladePalierLen: number;
  mixDuelPeriod: number;
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, logPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fd = openSync(logPath, 'a');
    const child = spawn(cmd, args, {
      cwd: BACKEND_ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', fd, fd],
    });
    child.on('error', (e) => { closeSync(fd); reject(e); });
    child.on('exit', (code) => {
      closeSync(fd);
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} a echoue (code ${code}), voir ${logPath}`));
    });
  });
}

async function waitHealthy(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'aucune reponse';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`le serveur n'a pas repondu sur ${url}/health : ${lastError}`);
}

export interface StartOptions {
  /** Longueur d'un palier en mode escalade (defaut produit : 3). */
  escaladePalierLen?: number;
  /** Periode de la mecanique de duel en mode mix (defaut produit : 4). */
  mixDuelPeriod?: number;
}

export async function startGameServer(opts: StartOptions = {}): Promise<TestServer> {
  const escaladePalierLen = opts.escaladePalierLen ?? 1;
  const mixDuelPeriod = opts.mixDuelPeriod ?? 3;

  const dir = mkdtempSync(path.join(os.tmpdir(), 'jeucouple-gameplay-'));
  const dbPath = path.join(dir, 'gameplay.sqlite');
  const logPath = path.join(dir, 'serveur.log');
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;

  // Base jetable peuplee avec tout le catalogue (categories + questions).
  await run('npx', ['tsx', 'src/import-thematic.ts'], { DATABASE_PATH: dbPath }, logPath);

  const fd = openSync(logPath, 'a');
  const child: ChildProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: dbPath,
      NODE_ENV: 'development',
      ESCALADE_PALIER_LEN: String(escaladePalierLen),
      MIX_DUEL_PERIOD: String(mixDuelPeriod),
    },
    stdio: ['ignore', fd, fd],
  });

  let exited = false;
  child.on('exit', () => { exited = true; });

  try {
    await waitHealthy(url, 90000);
  } catch (e) {
    child.kill('SIGKILL');
    closeSync(fd);
    throw e;
  }

  return {
    url,
    port,
    dbPath,
    logPath,
    escaladePalierLen,
    mixDuelPeriod,
    async stop() {
      if (!exited) {
        child.kill('SIGKILL');
        await new Promise((r) => setTimeout(r, 300));
      }
      try { closeSync(fd); } catch { /* deja ferme */ }
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* /tmp fera le menage */ }
    },
  };
}
