import type { LyricLine } from '../types.ts';

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META = /^\[(ar|ti|al|by|offset|length|re|ve|au|tool|kana):/i;

function seconds(minute: string, second: string, fraction?: string): number {
  const base = Number(minute) * 60 + Number(second);
  if (!fraction) return base;
  const scale = fraction.length >= 3 ? 1000 : fraction.length === 2 ? 100 : 10;
  return base + Number(fraction) / scale;
}

/**
 * 解析 LRC。一行可以有多个时间标签（同一句歌词的重复点）。
 * 元数据行（`[ar:]` 等）与没有文字的行使整首残缺——它们不产生歌词行。
 */
export function parseLrc(raw: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const source of raw.split(/\r?\n/)) {
    const line = source.trim();
    if (!line || META.test(line)) continue;
    const stamps: number[] = [];
    let cursor = 0;
    STAMP.lastIndex = 0;
    for (let match = STAMP.exec(line); match; match = STAMP.exec(line)) {
      if (match.index !== cursor) break;
      stamps.push(seconds(match[1], match[2], match[3]));
      cursor = STAMP.lastIndex;
    }
    if (!stamps.length) continue;
    const text = line.slice(cursor).trim();
    if (!text) continue;
    for (const at of stamps) out.push({ at, text });
  }
  out.sort((a, b) => a.at - b.at);
  const unique: LyricLine[] = [];
  for (const line of out) {
    const previous = unique.at(-1);
    if (previous && Math.abs(previous.at - line.at) < 0.05) {
      if (previous.text !== line.text) unique.push(line);
      continue;
    }
    unique.push(line);
  }
  return unique;
}

/** 播放位置所在的行；位置在首行之前时返回 -1。 */
export function indexAt(lines: readonly LyricLine[], position: number): number {
  if (!lines.length || position < lines[0].at) return -1;
  let low = 0;
  let high = lines.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lines[mid].at <= position) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** 这一行还剩多少秒；最后一行的剩余按曲目总长计算。 */
export function remaining(lines: readonly LyricLine[], index: number, durationMs: number, position: number): number {
  const next = lines[index + 1];
  const end = next ? next.at : durationMs > 0 ? durationMs / 1000 : position + 4;
  return Math.max(0, end - position);
}
