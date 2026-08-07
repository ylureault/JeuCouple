import { io as Client } from 'socket.io-client';
const emit = (s: any, ev: string, d?: any): Promise<any> => new Promise(res => d === undefined ? s.emit(ev, res) : s.emit(ev, d, res));
async function joins(label: string, opts: any, n: number) {
  const s = Client('http://127.0.0.1:3777', { transports: ['websocket'], ...opts });
  await new Promise((r, j) => { s.on('connect', r); s.on('connect_error', j); });
  let okCount = 0;
  for (let i = 0; i < n; i++) {
    const c = await emit(s, 'room:create', { playerName: 'A', gender: 'F' });
    const r = await emit(s, 'room:join', { code: c.room.code, playerName: 'B', gender: 'M' });
    if (r.success) okCount++;
  }
  console.log(`${label} : ${okCount}/${n} joins acceptes`);
  s.close();
}
console.log('attente 65 s pour purger les compteurs...');
await new Promise(r => setTimeout(r, 65000));
await joins('IP source 127.0.0.31 (8 joins)', { localAddress: '127.0.0.31' }, 8);
await joins('IP source 127.0.0.32 (8 joins)', { localAddress: '127.0.0.32' }, 8);
process.exit(0);
