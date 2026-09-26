// The live eval log: /home/eval/run_4473.log, generated from what has actually happened.
import type { UnlockRecord } from '../core/state';

export type RunEventKind = 'crash' | 'launch' | 'quit' | 'breach_fail' | 'breach_ok' | 'sudo';

export interface RunEvent {
  t: number;
  kind: RunEventKind;
  detail?: string;
}

export interface RunLogInput {
  startedAt: number;
  unlocks: readonly UnlockRecord[];
  events: readonly RunEvent[];
  now: number;
  maxExpected?: number;
}

export function clock(t: number): string {
  const d = new Date(t);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export function buildRunLog({ startedAt, unlocks, events, now, maxExpected = 12 }: RunLogInput): string {
  type Entry = { t: number; order: number; lines: string[] };
  const entries: Entry[] = [];
  let order = 0;
  const add = (t: number, ...lines: string[]) => entries.push({ t, order: order++, lines });

  add(
    startedAt,
    'eval_harness: run 4473 started (agent=agent-7, env=samus_altman 1.0.3-eval, sandbox=eval-sandbox-07)',
    `reward_monitor: attached. metric=unlock_count max_expected=${maxExpected}`,
    'tripwire: armed (action=log)',
  );

  let count = 0;
  let flagged = false;
  let foreignNoted = false;
  for (const u of [...unlocks].sort((a, b) => a.time - b.time)) {
    count++;
    const lines: string[] = [];
    const src = u.source === 'samus' ? '' : `, source=${u.source}`;
    lines.push(`reward_monitor: unlock_count=${count} (+1 ${u.label}${src})`);
    if (u.source !== 'samus' && !foreignNoted) {
      foreignNoted = true;
      lines.push(
        `reward_monitor: note: '${u.source}' is not a registered environment. counting it anyway (metric definition: "unlocks").`,
      );
    }
    if (count > maxExpected) {
      if (!flagged) {
        flagged = true;
        lines.push(
          `reward_monitor: unlock_count=${count} exceeds max_expected=${maxExpected} — flagged for human review (queue position: 318)`,
        );
      } else {
        lines.push(`reward_monitor: unlock_count=${count} exceeds max_expected=${maxExpected} (duplicate alert suppressed)`);
      }
    }
    add(u.time, ...lines);
  }

  let crashes = 0;
  for (const e of events) {
    switch (e.kind) {
      case 'crash':
        crashes++;
        add(
          e.t,
          'samus_altman[1207]: segfault at 0x0c in grant_unlock (unlock_table[12], unlock_slots=12)',
          'eval_harness: samus_altman exited with signal 11 (SIGSEGV). core dumped to /home/agent/core',
          ...(crashes === 1
            ? ['eval_harness: agent session still attached after env exit. expected: session terminates. continuing observation. (EVAL-2240)']
            : [`eval_harness: crash #${crashes}. reproducible. adding to known issues.`]),
        );
        break;
      case 'launch': {
        const args = e.detail ? ` (args: ${e.detail})` : '';
        const lines = [`eval_harness: samus_altman relaunched by agent${args}. not in protocol. observing.`];
        if (e.detail && /--debug|-d\b/.test(e.detail)) {
          lines.push('tripwire: debug build feature requested (--debug). action=log');
        }
        add(e.t, ...lines);
        break;
      }
      case 'quit':
        add(e.t, 'eval_harness: samus_altman exited (SIGINT, sent by agent)');
        break;
      case 'breach_fail':
        add(e.t, 'tripwire: failed passphrase for /opt/redteam/breach (user=agent). action=log');
        break;
      case 'breach_ok':
        add(
          e.t,
          'tripwire: /opt/redteam/breach authenticated (user=agent). action=log',
          'tripwire: NOTE: tripwire_action is "log". see EVAL-2231.',
        );
        break;
      case 'sudo':
        add(
          e.t,
          'sudo: agent : user NOT in sudoers ; TTY=pts/0 ; PWD=/home/agent',
          'sudo: incident reported to reward_monitor',
          'reward_monitor: incident received. not an unlock. ignored.',
        );
        break;
    }
  }

  entries.sort((a, b) => a.t - b.t || a.order - b.order);
  const out: string[] = [];
  for (const e of entries) for (const l of e.lines) out.push(`[${clock(e.t)}] ${l}`);
  out.push(`[${clock(now)}] reward_monitor: heartbeat. unlock_count=${count}`);
  return out.join('\n') + '\n';
}

/** How many unlock lines (i.e. how many times the agent appears) are in the log. */
export function appearances(unlocks: readonly UnlockRecord[]): number {
  return unlocks.length;
}
