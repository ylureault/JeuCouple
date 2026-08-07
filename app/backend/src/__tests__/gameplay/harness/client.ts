/**
 * Deux VRAIS clients socket.io assis a la meme table.
 *
 * Aucun mock : on ouvre de vraies connexions vers le serveur lance par
 * harness/server.ts, on cree un vrai salon, on joue de vraies manches.
 *
 * Chaque table sort par sa propre adresse source (127.0.0.x) : le serveur
 * limite les tentatives de `room:join` a 15 par minute et par IP, ce qui
 * plafonnerait toute la suite si tous les joueurs partageaient 127.0.0.1.
 */
import { io as ClientIO, type Socket } from 'socket.io-client';
import { bonneReponse } from './oracle.js';

export interface Entry {
  ev: string;
  data: any;
  t: number;
}

interface Waiter {
  ev: string;
  pred?: (data: any) => boolean;
  resolve: (e: Entry) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface WaitOptions {
  pred?: (data: any) => boolean;
  timeout?: number;
  /** Libelle ajoute au message d'erreur pour rendre l'echec parlant. */
  what?: string;
}

export class Peer {
  readonly socket: Socket;
  readonly log: Entry[] = [];
  playerId: 1 | 2 = 1;
  sessionToken = '';
  name = '';

  private cursor = 0;
  private waiters: Waiter[] = [];

  private constructor(socket: Socket, name: string) {
    this.socket = socket;
    this.name = name;
    socket.onAny((ev: string, ...args: unknown[]) => {
      this.push({ ev, data: args[0], t: Date.now() });
    });
  }

  static async connect(url: string, localAddress: string, name: string): Promise<Peer> {
    const socket = ClientIO(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      // Adresse source dediee : chaque table a son propre compteur anti-abus.
      localAddress,
    } as never);
    const peer = new Peer(socket, name);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`connexion impossible a ${url} (${name})`)), 20000);
      socket.on('connect', () => { clearTimeout(timer); resolve(); });
      socket.on('connect_error', (err: Error) => { clearTimeout(timer); reject(err); });
    });
    return peer;
  }

  private push(entry: Entry): void {
    this.log.push(entry);
    const idx = this.log.length - 1;
    for (let i = 0; i < this.waiters.length; i++) {
      const w = this.waiters[i];
      if (w.ev !== entry.ev) continue;
      if (w.pred && !w.pred(entry.data)) continue;
      this.waiters.splice(i, 1);
      clearTimeout(w.timer);
      this.cursor = idx + 1;
      w.resolve(entry);
      return;
    }
  }

  /** Attend le prochain evenement `ev` non encore consomme. */
  wait(ev: string, opts: WaitOptions = {}): Promise<Entry> {
    const timeout = opts.timeout ?? 30000;
    for (let i = this.cursor; i < this.log.length; i++) {
      const e = this.log[i];
      if (e.ev === ev && (!opts.pred || opts.pred(e.data))) {
        this.cursor = i + 1;
        return Promise.resolve(e);
      }
    }
    this.cursor = this.log.length;
    return new Promise<Entry>((resolve, reject) => {
      const w: Waiter = {
        ev,
        pred: opts.pred,
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = this.waiters.indexOf(w);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new Error(
            `${this.name} : aucun « ${ev} » recu en ${timeout} ms` +
            (opts.what ? ` (${opts.what})` : '')
          ));
        }, timeout),
      };
      this.waiters.push(w);
    });
  }

  /** Dernier evenement `ev` recu depuis le debut (independant du curseur). */
  last(ev: string): Entry | undefined {
    for (let i = this.log.length - 1; i >= 0; i--) if (this.log[i].ev === ev) return this.log[i];
    return undefined;
  }

  /** Vrai si AUCUN evenement `ev` n'arrive pendant `ms` (assertion de silence). */
  async silence(ev: string, ms: number, pred?: (d: any) => boolean): Promise<boolean> {
    try {
      await this.wait(ev, { timeout: ms, pred });
      return false;
    } catch {
      return true;
    }
  }

  emitAck<T = any>(ev: string, data?: unknown, timeout = 15000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.name} : pas d'accuse de reception pour « ${ev} »`)),
        timeout
      );
      const cb = (res: T) => { clearTimeout(timer); resolve(res); };
      if (data === undefined) (this.socket as any).emit(ev, cb);
      else (this.socket as any).emit(ev, data, cb);
    });
  }

  emit(ev: string, data?: unknown): void {
    if (data === undefined) (this.socket as any).emit(ev);
    else (this.socket as any).emit(ev, data);
  }

  answer(text: string): Promise<{ accepted: boolean; error?: string }> {
    return this.emitAck('game:answer', { answer: text });
  }

  close(): void {
    for (const w of this.waiters) clearTimeout(w.timer);
    this.waiters.length = 0;
    this.socket.close();
  }
}

export interface PartyOptions {
  url: string;
  ip: string;
  gameMode: string;
  questionTypes?: string[];
  categories?: string[];
  questionCount?: number;
  /** Repond automatiquement aux choix de theme (duel/mix) et paliers (escalade). */
  auto?: boolean;
  hostName?: string;
  guestName?: string;
}

/** Un salon, deux joueurs connectes, prets a jouer. */
export class Party {
  host!: Peer;
  guest!: Peer;
  code = '';
  readonly mode: string;
  private autoOn: boolean;

  private constructor(mode: string, auto: boolean) {
    this.mode = mode;
    this.autoOn = auto;
  }

  static async open(o: PartyOptions): Promise<Party> {
    const party = new Party(o.gameMode, o.auto !== false);
    party.host = await Peer.connect(o.url, o.ip, `${o.gameMode}/hote`);
    party.guest = await Peer.connect(o.url, o.ip, `${o.gameMode}/invite`);

    const created = await party.host.emitAck<any>('room:create', {
      playerName: o.hostName ?? 'Alice',
      gender: 'F',
      gameMode: o.gameMode,
      questionCount: o.questionCount,
      categories: o.categories,
      questionTypes: o.questionTypes,
    });
    if (!created?.success) throw new Error(`room:create refuse : ${created?.error}`);
    party.code = created.room.code;
    party.host.playerId = 1;
    party.host.sessionToken = created.sessionToken;

    const joined = await party.guest.emitAck<any>('room:join', {
      code: party.code,
      playerName: o.guestName ?? 'Bob',
      gender: 'M',
    });
    if (!joined?.success) throw new Error(`room:join refuse : ${joined?.error}`);
    party.guest.playerId = 2;
    party.guest.sessionToken = joined.sessionToken;

    party.installAuto();
    return party;
  }

  private installAuto(): void {
    for (const peer of [this.host, this.guest]) {
      peer.socket.on('duel:choose-theme', (d: any) => {
        if (this.autoOn && d?.options?.length) {
          peer.emit('duel:choose-theme', { category: d.options[0].code });
        }
      });
      peer.socket.on('escalade:palier', () => {
        if (this.autoOn) peer.emit('escalade:palier-respond', { accept: true });
      });
    }
  }

  setAuto(on: boolean): void {
    this.autoOn = on;
  }

  /** Le joueur 2 valide les reglages (consentement explicite exige par le serveur). */
  async accept(): Promise<void> {
    this.guest.emit('room:accept-settings');
    await this.host.wait('room:settings-accepted', { timeout: 5000, what: 'accord du joueur 2' });
  }

  start(): Promise<{ success: boolean; error?: string }> {
    return this.host.emitAck('game:start');
  }

  /** Accord du joueur 2 + lancement, le cas nominal. */
  async begin(): Promise<void> {
    await this.accept();
    const started = await this.start();
    if (!started.success) throw new Error(`game:start refuse : ${started.error}`);
  }

  close(): void {
    this.host.close();
    this.guest.close();
  }
}

// ---------------------------------------------------------------------------
// Reponses realistes, type par type (memes valeurs que celles emises par
// l'interface, cf. app/frontend/src/components/QuestionCard.tsx).
// ---------------------------------------------------------------------------

const LONG_TEXT_1 = 'Je repense souvent a ce soir-la, on avait tout notre temps.';
const LONG_TEXT_2 = 'Moi je garde surtout le fou rire du retour, impossible a oublier.';

/** Reponse qui, donnee par les deux joueurs, constitue un accord. */
export function accord(q: any): string {
  switch (q.type) {
    case 'A': case 'B': return q.options?.[0] ?? 'oui';
    case 'H': return bonneReponse(q) ?? q.options?.[0] ?? 'oui';
    case 'C': return LONG_TEXT_1;
    case 'D': case 'Q': return '7';
    case 'E': case 'I': case 'L': return 'A';
    case 'F': return 'player1';
    case 'G': return 'vrai';
    case 'N': return 'plus';
    case 'S': return 'daccord';
    case 'J': return '2020-06';
    case 'K': return '12';
    case 'M': return 'un,deux,trois';
    default: return 'oui';
  }
}

/** Reponse opposee : donnee face a `accord`, elle produit un desaccord. */
export function desaccord(q: any): string {
  switch (q.type) {
    case 'A': case 'B': return q.options?.[1] ?? 'non';
    case 'H': {
      const bonne = bonneReponse(q);
      const wrong = (q.options ?? []).find((o: string) => o !== bonne);
      return wrong ?? 'non';
    }
    case 'C': return LONG_TEXT_2;
    case 'D': case 'Q': return '1';
    case 'E': case 'I': case 'L': return 'B';
    case 'F': return 'player2';
    case 'G': return 'faux';
    case 'N': return 'moins';
    case 'S': return 'pasdaccord';
    case 'J': return '2015-01';
    case 'K': return '48';
    case 'M': return 'trois,deux,un';
    default: return 'non';
  }
}

/** Points de base attendus quand les deux joueurs sont d'accord. */
export function baremeAccord(type: string): number {
  // Type C : pas de bonne reponse, mais une reponse fournie (>= 20 caracteres)
  // vaut le bonus "reponse reflechie" de 50 points.
  return type === 'C' ? 50 : 100;
}

/** Attend qu'une condition devienne vraie (scrutation), ou renonce. */
export async function until(pred: () => boolean, ms: number, pas = 200): Promise<boolean> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, pas));
  }
  return pred();
}

export interface RoundResult {
  question: any;
  questionGuest: any;
  tQuestion: number;
  ack1: { accepted: boolean; error?: string } | null;
  ack2: { accepted: boolean; error?: string } | null;
  reveal: any;
  tReveal: number;
  score: { score1: number; score2: number };
}

export interface RoundOptions {
  /** Reponse du joueur 1 ; `null` = il ne repond pas. */
  a1?: ((q: any) => string) | string | null;
  /** Reponse du joueur 2 ; `null` = il ne repond pas. */
  a2?: ((q: any) => string) | string | null;
  /** Delai entre les deux reponses (pour departager a la vitesse). */
  gapMs?: number;
  /** Qui repond en premier (le plus rapide remporte la manche a egalite). */
  first?: 1 | 2;
  questionTimeout?: number;
  revealTimeout?: number;
}

function resolveAnswer(spec: RoundOptions['a1'], q: any): string | null {
  if (spec === null) return null;
  if (spec === undefined) return accord(q);
  return typeof spec === 'function' ? spec(q) : spec;
}

/** Joue une manche complete : question -> reponses -> revelation -> score. */
export async function playRound(party: Party, opts: RoundOptions = {}): Promise<RoundResult> {
  const qh = await party.host.wait('game:question', {
    timeout: opts.questionTimeout ?? 40000,
    what: 'question suivante',
  });
  const qg = await party.guest.wait('game:question', { timeout: 8000, what: 'question cote invite' });
  const question = qh.data.question;

  const t1 = resolveAnswer(opts.a1, question);
  const t2 = resolveAnswer(opts.a2, question);

  let ack1: { accepted: boolean; error?: string } | null = null;
  let ack2: { accepted: boolean; error?: string } | null = null;
  if (opts.first === 2) {
    ack2 = t2 === null ? null : await party.guest.answer(t2);
    if (opts.gapMs) await new Promise((r) => setTimeout(r, opts.gapMs));
    ack1 = t1 === null ? null : await party.host.answer(t1);
  } else {
    ack1 = t1 === null ? null : await party.host.answer(t1);
    if (opts.gapMs) await new Promise((r) => setTimeout(r, opts.gapMs));
    ack2 = t2 === null ? null : await party.guest.answer(t2);
  }

  // Sans reponse des deux, la revelation attend l'expiration du chrono.
  const revealTimeout = opts.revealTimeout ?? (t1 === null || t2 === null ? (question.timer + 12) * 1000 : 15000);
  const rev = await party.host.wait('game:reveal', { timeout: revealTimeout, what: 'revelation' });
  const score = await party.host.wait('game:score-update', { timeout: 8000, what: 'mise a jour du score' });

  return {
    question,
    questionGuest: qg.data.question,
    tQuestion: qh.t,
    ack1,
    ack2,
    reveal: rev.data,
    tReveal: rev.t,
    score: score.data,
  };
}
