import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { jxaSource } from './script.ts';
import type { Sample } from '../types.ts';

export interface ReaderHandlers {
  sample(sample: Sample): void;
  problem(kind: 'denied' | 'crashed', detail: string): void;
  log?(message: string): void;
}

const SILENT_MS = 5000;
const RESTART_DELAY_MS = 2000;
const CRASH_WINDOW_MS = 120_000;

/**
 * 常驻 `osascript -l JavaScript` 子进程。进程 stdout 只有 NDJSON；stderr 与退出码用于判断
 * 授权被拒或反复崩溃。看门狗在 5 秒无输出时重拉，连续 3 次崩溃上报一次。
 */
export class JxaReader {
  private child?: ChildProcessByStdio<null, Readable, Readable>;
  private stopping = false;
  private lastLineAt = 0;
  private watch?: ReturnType<typeof setInterval>;
  private crashes: number[] = [];
  private generation = 0;

  constructor(private readonly pollMs: number, private readonly handlers: ReaderHandlers) {}

  start(): void {
    if (this.child) return;
    this.stopping = false;
    this.lastLineAt = Date.now();
    this.launch();
    this.watch = setInterval(() => this.check(), 2000);
  }

  stop(): void {
    this.stopping = true;
    this.generation++;
    if (this.watch) clearInterval(this.watch);
    this.watch = undefined;
    this.child?.kill('SIGTERM');
    this.child = undefined;
  }

  get running(): boolean {
    return !!this.child;
  }

  private launch(): void {
    if (this.stopping) return;
    const generation = ++this.generation;
    let stderr = '';
    const child = spawn('/usr/bin/osascript', ['-l', 'JavaScript', '-e', jxaSource(this.pollMs)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.lastLineAt = Date.now();

    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (generation !== this.generation) return;
      this.lastLineAt = Date.now();
      const sample = parseSample(line);
      if (sample) this.handlers.sample(sample);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-4000);
    });
    child.on('error', (err) => {
      if (generation !== this.generation) return;
      this.handlers.log?.(`osascript 启动失败：${err.message}`);
    });
    child.on('close', (code) => {
      if (generation !== this.generation) return;
      this.child = undefined;
      if (this.stopping) return;
      if (denied(stderr)) {
        this.handlers.problem('denied', stderr.trim());
        return;
      }
      this.noteCrash();
      setTimeout(() => { if (!this.stopping && !this.child) this.launch(); }, RESTART_DELAY_MS);
      this.handlers.log?.(`osascript 退出（code ${code}），${RESTART_DELAY_MS} ms 后重启`);
    });
  }

  private check(): void {
    if (this.stopping || !this.child) return;
    if (Date.now() - this.lastLineAt < SILENT_MS) return;
    this.handlers.log?.(`osascript ${SILENT_MS} ms 无输出，重启读取器`);
    this.noteCrash();
    this.generation++;
    this.child.kill('SIGTERM');
    this.child = undefined;
    setTimeout(() => { if (!this.stopping && !this.child) this.launch(); }, RESTART_DELAY_MS);
  }

  private noteCrash(): void {
    const now = Date.now();
    this.crashes = [...this.crashes.filter((at) => now - at < CRASH_WINDOW_MS), now];
    if (this.crashes.length === 3) this.handlers.problem('crashed', '');
  }
}

/** 单行 NDJSON → Sample；坏行返回 null，不影响后续行。 */
export function parseSample(line: string): Sample | null {
  const raw = line.trim();
  if (!raw.startsWith('{')) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  const state = o.state;
  if (state !== 'playing' && state !== 'paused' && state !== 'stopped' && state !== 'absent' && state !== 'error') return null;
  const at = typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : Date.now();
  if (state === 'error') return { at, state, message: typeof o.message === 'string' ? o.message : '' };
  if (state !== 'playing' && state !== 'paused') return { at, state };
  const id = typeof o.id === 'string' ? o.id : '';
  const position = typeof o.position === 'number' && Number.isFinite(o.position) ? o.position : 0;
  const durationMs = typeof o.durationMs === 'number' && Number.isFinite(o.durationMs) ? o.durationMs : 0;
  if (!id) return { at, state: 'error', message: '空曲目 id' };
  return {
    at,
    state,
    id,
    name: typeof o.name === 'string' ? o.name : '',
    artist: typeof o.artist === 'string' ? o.artist : '',
    album: typeof o.album === 'string' ? o.album : '',
    durationMs,
    position,
  };
}

/** macOS 自动化授权被拒时的错误码。 */
export function denied(text: string): boolean {
  return /-?1743/.test(text) || /not authori[sz]ed/i.test(text);
}
