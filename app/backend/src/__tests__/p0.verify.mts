// Verification de bout en bout des P0 contre le VRAI serveur (les suites de
// tests existantes mockent leurs propres handlers et ne prouvent rien ici).
import { io as Client } from 'socket.io-client';

const URL = 'http://127.0.0.1:3104';
const ok = (name: string, cond: boolean) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) process.exitCode = 1;
};
const emit = <T,>(s: ReturnType<typeof Client>, ev: string, data?: unknown): Promise<T> =>
  new Promise((res) => data === undefined ? s.emit(ev, res) : s.emit(ev, data, res));

const host = Client(URL); const guest = Client(URL);
await new Promise(r => host.on('connect', r));
await new Promise(r => guest.on('connect', r));

// create + join
const created: any = await emit(host, 'room:create', { playerName: 'Alice', gender: 'F', gameMode: 'complices' });
ok('create renvoie un jeton', !!created.sessionToken);
ok('code a 6 chiffres', /^\d{6}$/.test(created.room.code));
const code = created.room.code;

let settingsSeen: any = null;
guest.on('room:settings', (d: any) => { settingsSeen = d; });
const joined: any = await emit(guest, 'room:join', { code, playerName: 'Bob', gender: 'M' });
ok('join renvoie un jeton', !!joined.sessionToken);
await new Promise(r => setTimeout(r, 300));
ok('recap des reglages recu par J2', settingsSeen?.gameMode === 'complices' && settingsSeen?.modeLabel?.length > 0);

// start bloque sans accord
const blocked: any = await emit(host, 'game:start');
ok('start BLOQUE sans accord de J2', blocked.success === false && /accepte/.test(blocked.error ?? ''));

// accord puis start
guest.emit('room:accept-settings');
await new Promise(r => setTimeout(r, 300));
const started: any = await emit(host, 'game:start');
ok('start OK apres accord', started.success === true);
await new Promise(r => setTimeout(r, 4000)); // laisse passer l'intro serveur

// ack de reponse
const ansOk: any = await emit(host, 'game:answer', { answer: 'test' });
ok('answer acceptee => ack {accepted:true}', ansOk?.accepted === true);
const ansDup: any = await emit(host, 'game:answer', { answer: 'test2' });
ok('doublon refuse avec message', ansDup?.accepted === false && !!ansDup?.error);
const ansLong: any = await emit(guest, 'game:answer', { answer: 'x'.repeat(501) });
ok('reponse >500 refusee (pas tronquee)', ansLong?.accepted === false);

// reconnect : sans jeton refuse, avec jeton accepte
const thief = Client(URL);
await new Promise(r => thief.on('connect', r));
const stolen: any = await emit(thief, 'room:reconnect', { code, playerId: 1 });
ok('reconnect SANS jeton refuse', stolen.success === false);
const legit: any = await emit(thief, 'room:reconnect', { code, playerId: 1, sessionToken: created.sessionToken });
ok('reconnect AVEC jeton accepte', legit.success === true);

host.close(); guest.close(); thief.close();
process.exit(process.exitCode ?? 0);
