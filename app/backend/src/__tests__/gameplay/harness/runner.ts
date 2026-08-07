/**
 * Ordonnanceur et rapporteur de la suite gameplay.
 *
 * Chaque "session" ouvre son propre salon avec ses propres sockets, joue de
 * vraies manches, et rend un verdict par scenario. Les sessions tournent en
 * parallele (salons independants) pour tenir la duree totale malgre la cadence
 * reelle du jeu (7 s entre chaque manche).
 */
import { Party, type PartyOptions } from './client.js';

export type Status = 'PASS' | 'FAIL' | 'BUG';

export interface Result {
  group: string;
  session: string;
  name: string;
  status: Status;
  detail?: string;
}

export interface Ctx {
  readonly url: string;
  readonly ip: string;
  /** Base SQLite jetable du serveur, pour mesurer un vivier reel en lecture seule. */
  readonly dbPath: string;
  readonly escaladePalierLen: number;
  readonly mixDuelPeriod: number;
  /** Assertion normale : un echec fait echouer la suite. */
  ok(name: string, cond: boolean, detail?: string): boolean;
  /**
   * Assertion dont l'echec est un bug PRODUIT deja identifie : il est rapporte
   * a part (statut BUG) sans faire echouer la suite, pour que les regressions
   * restent visibles sans masquer les anomalies connues.
   */
  bug(name: string, cond: boolean, bug: string, detail?: string): boolean;
  /** Ouvre une table suivie : elle sera fermee meme si la session echoue. */
  party(opts: Omit<PartyOptions, 'url' | 'ip'>): Promise<Party>;
}

export interface Session {
  id: string;
  group: string;
  /** Nombre de scenarios que la session doit rendre (garde-fou anti-silence). */
  expected: number;
  timeoutMs?: number;
  run(t: Ctx): Promise<void>;
}

const DEFAULT_TIMEOUT = 260_000;

export interface RunOptions {
  url: string;
  dbPath: string;
  concurrency: number;
  escaladePalierLen: number;
  mixDuelPeriod: number;
  filter?: string;
}

interface SessionOutcome {
  session: Session;
  results: Result[];
  ms: number;
}

async function runSession(session: Session, ip: string, o: RunOptions): Promise<SessionOutcome> {
  const results: Result[] = [];
  const seen = new Set<string>();
  const parties: Party[] = [];
  const started = Date.now();

  const record = (name: string, status: Status, detail?: string) => {
    if (seen.has(name)) {
      results.push({
        group: session.group, session: session.id,
        name: `${name} (doublon de nom de scenario)`, status: 'FAIL',
        detail: 'deux scenarios portent le meme nom dans cette session',
      });
      return;
    }
    seen.add(name);
    results.push({ group: session.group, session: session.id, name, status, detail });
  };

  const t: Ctx = {
    url: o.url,
    ip,
    dbPath: o.dbPath,
    escaladePalierLen: o.escaladePalierLen,
    mixDuelPeriod: o.mixDuelPeriod,
    ok(name, cond, detail) {
      record(name, cond ? 'PASS' : 'FAIL', cond ? undefined : detail);
      return cond;
    },
    bug(name, cond, bug, detail) {
      record(name, cond ? 'PASS' : 'BUG', cond ? undefined : `${bug}${detail ? ` — observe : ${detail}` : ''}`);
      return cond;
    },
    async party(opts) {
      const p = await Party.open({ ...opts, url: o.url, ip });
      parties.push(p);
      return p;
    },
  };

  try {
    await Promise.race([
      session.run(t),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`session au-dela de ${(session.timeoutMs ?? DEFAULT_TIMEOUT) / 1000} s`)),
          session.timeoutMs ?? DEFAULT_TIMEOUT)
      ),
    ]);
  } catch (e) {
    results.push({
      group: session.group, session: session.id,
      name: `${session.id} : session interrompue`, status: 'FAIL',
      detail: (e as Error).message,
    });
  } finally {
    for (const p of parties) {
      try { p.close(); } catch { /* socket deja ferme */ }
    }
  }

  const rendered = results.filter((r) => !r.name.endsWith('session interrompue')).length;
  if (rendered < session.expected) {
    results.push({
      group: session.group, session: session.id,
      name: `${session.id} : ${session.expected - rendered} scenario(s) non atteint(s)`,
      status: 'FAIL',
      detail: `${rendered} scenario(s) rendus sur ${session.expected} attendus`,
    });
  }

  return { session, results, ms: Date.now() - started };
}

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

function badge(s: Status): string {
  if (s === 'PASS') return `${C.green}PASS${C.reset}`;
  if (s === 'FAIL') return `${C.red}FAIL${C.reset}`;
  return `${C.yellow}BUG ${C.reset}`;
}

export async function runAll(sessions: Session[], o: RunOptions): Promise<number> {
  const selected = o.filter
    ? sessions.filter((s) => s.id.includes(o.filter!) || s.group.includes(o.filter!))
    : sessions;

  if (selected.length === 0) {
    console.error('Aucune session ne correspond au filtre demande.');
    return 1;
  }

  const outcomes: SessionOutcome[] = new Array(selected.length);
  let next = 0;
  let done = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= selected.length) return;
      // Adresse source dediee : les compteurs anti-abus du serveur sont par IP.
      const ip = `127.0.0.${(i % 240) + 2}`;
      outcomes[i] = await runSession(selected[i], ip, o);
      done++;
      const oc = outcomes[i];
      const bad = oc.results.filter((r) => r.status === 'FAIL').length;
      const bugs = oc.results.filter((r) => r.status === 'BUG').length;
      process.stderr.write(
        `${C.dim}[${String(done).padStart(2)}/${selected.length}]${C.reset} ` +
        `${bad ? C.red + '✗' : C.green + '✓'}${C.reset} ${oc.session.id} ` +
        `${C.dim}(${oc.results.length} scenarios, ${(oc.ms / 1000).toFixed(0)} s` +
        `${bugs ? `, ${bugs} bug produit` : ''})${C.reset}\n`
      );
    }
  };

  await Promise.all(Array.from({ length: Math.min(o.concurrency, selected.length) }, worker));

  // ---------------------------------------------------------------- rapport
  const all = outcomes.flatMap((oc) => oc.results);
  const groups: string[] = [];
  for (const r of all) if (!groups.includes(r.group)) groups.push(r.group);

  console.log(`\n${C.bold}══════════════════ DETAIL DES SCENARIOS ══════════════════${C.reset}`);
  for (const g of groups) {
    console.log(`\n${C.bold}${C.cyan}── ${g} ──${C.reset}`);
    for (const r of all.filter((x) => x.group === g)) {
      console.log(`  ${badge(r.status)}  ${r.name}`);
      if (r.detail) console.log(`        ${C.dim}${r.detail}${C.reset}`);
    }
  }

  console.log(`\n${C.bold}══════════════════ RECAPITULATIF ══════════════════${C.reset}`);
  console.log(`${'Groupe'.padEnd(30)} ${'PASS'.padStart(5)} ${'FAIL'.padStart(5)} ${'BUG'.padStart(5)} ${'TOTAL'.padStart(6)}`);
  console.log('-'.repeat(56));
  let tp = 0, tf = 0, tb = 0;
  for (const g of groups) {
    const rs = all.filter((x) => x.group === g);
    const p = rs.filter((x) => x.status === 'PASS').length;
    const f = rs.filter((x) => x.status === 'FAIL').length;
    const b = rs.filter((x) => x.status === 'BUG').length;
    tp += p; tf += f; tb += b;
    console.log(
      `${g.padEnd(30)} ${String(p).padStart(5)} ` +
      `${(f ? C.red : '') + String(f).padStart(5) + (f ? C.reset : '')} ` +
      `${(b ? C.yellow : '') + String(b).padStart(5) + (b ? C.reset : '')} ` +
      `${String(rs.length).padStart(6)}`
    );
  }
  console.log('-'.repeat(56));
  console.log(`${'TOTAL'.padEnd(30)} ${String(tp).padStart(5)} ${String(tf).padStart(5)} ${String(tb).padStart(5)} ${String(all.length).padStart(6)}`);

  const bugs = all.filter((r) => r.status === 'BUG');
  if (bugs.length > 0) {
    console.log(`\n${C.bold}${C.yellow}BUGS PRODUIT CONFIRMES (n'echouent pas la suite)${C.reset}`);
    for (const b of bugs) console.log(`  • ${b.name}\n      ${C.dim}${b.detail}${C.reset}`);
  }

  const fails = all.filter((r) => r.status === 'FAIL');
  if (fails.length > 0) {
    console.log(`\n${C.bold}${C.red}ECHECS${C.reset}`);
    for (const f of fails) console.log(`  • ${f.name}\n      ${C.dim}${f.detail ?? ''}${C.reset}`);
  }

  console.log(
    `\n${C.bold}RESULTAT : ${fails.length === 0 ? C.green + 'SUITE VERTE' : C.red + 'SUITE ROUGE'}${C.reset}` +
    ` — ${tp} PASS / ${tf} FAIL / ${tb} bug(s) produit sur ${all.length} scenarios\n`
  );

  return fails.length === 0 ? 0 : 1;
}
