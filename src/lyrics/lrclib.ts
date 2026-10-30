import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseLrc } from './lrc.ts';
import type { Lyrics, Track } from '../types.ts';

const ENDPOINT = 'https://lrclib.net/api/search';
const AGENT = 'cortico-world-spotify-lyrics (+https://github.com/Pal-AI-Lab/cortico-extensions)';
const FRESH_MS = 30 * 24 * 3600_000;
/** 确认没有这首歌时等久一点；网络失败时很快重试。 */
const MISS_MS = 5 * 60_000;
const RETRY_MS = 20_000;
const TIMEOUT_MS = 8000;

interface Hit {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string | null;
}

/** 去掉括号内容、大小写与标点，供标题和歌手的宽松比较。 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（(【\[].*?[)）】\]]/g, ' ')
    .replace(/[\s\-_·'"'.,，、!！?？:：;；/&+]/g, '')
    .trim();
}

/**
 * 一条搜索结果与当前曲目的契合度。没有同步歌词的直接判负；
 * 时长差是首要依据，歌手与专辑只作加分。
 */
export function score(hit: Hit, track: Track): number {
  if (!hit.syncedLyrics) return -100;
  let points = 0;
  const seconds = typeof hit.duration === 'number' ? hit.duration : 0;
  if (track.durationMs > 0 && seconds > 0) {
    const diff = Math.abs(seconds - track.durationMs / 1000);
    points += diff <= 2 ? 6 : diff <= 5 ? 3 : diff <= 10 ? 0 : -4;
  }
  const name = normalizeText(track.name);
  const hitName = normalizeText(hit.trackName ?? '');
  if (name && hitName === name) points += 2;
  else if (name && (hitName.includes(name) || name.includes(hitName))) points += 1;
  const artist = normalizeText(track.artist);
  const hitArtist = normalizeText(hit.artistName ?? '');
  if (artist && hitArtist.includes(artist)) points += 3;
  const album = normalizeText(track.album);
  const hitAlbum = normalizeText(hit.albumName ?? '');
  if (album && hitAlbum === album) points += 2;
  else if (album && (hitAlbum.includes(album) || album.includes(hitAlbum))) points += 1;
  return points;
}

/** 最高分且高于阈值的那条；全都不合格时返回 null。 */
export function pickBest(hits: readonly Hit[], track: Track): Hit | null {
  let best: Hit | null = null;
  let bestScore = 1;
  for (const hit of hits) {
    const points = score(hit, track);
    if (points > bestScore) {
      best = hit;
      bestScore = points;
    }
  }
  return best;
}

/**
 * 曲目歌词：本地 `lrc/<id>.lrc` 优先，其次 LRCLIB，结果缓存 30 天，查不到 5 分钟内不重试。
 * 任何网络或解析失败都只返回 null，不抛出。
 */
export class LyricsStore {
  private misses = new Map<string, { at: number; ttl: number }>();

  constructor(private readonly dir: string) {}

  private file(name: string): string {
    return join(this.dir, name);
  }

  /** 用户自己放的同步歌词，优先于任何在线来源。 */
  async local(trackId: string): Promise<Lyrics | null> {
    try {
      const raw = await readFile(this.file(join('lrc', `${trackId}.lrc`)), 'utf8');
      const lines = parseLrc(raw);
      return lines.length ? { trackId, source: 'local', lines, at: Date.now() } : null;
    } catch {
      return null;
    }
  }

  /** `force` 跳过失败缓存，供调用方按自己的节奏重试。 */
  async load(track: Track, source: 'auto' | 'local' | 'off', force = false): Promise<Lyrics | null> {
    if (source === 'off') return null;
    const local = await this.local(track.id);
    if (local) return local;
    if (source === 'local') return null;

    const cached = await this.cached(track.id);
    if (cached) return cached;
    const miss = this.misses.get(track.id);
    if (!force && miss && Date.now() - miss.at < miss.ttl) return null;

    const found = await this.fetch(track);
    if (found === 'error') {
      this.misses.set(track.id, { at: Date.now(), ttl: RETRY_MS });
      return null;
    }
    if (!found) {
      this.misses.set(track.id, { at: Date.now(), ttl: MISS_MS });
      return null;
    }
    this.misses.delete(track.id);
    void this.store(found);
    return found;
  }

  private async cached(trackId: string): Promise<Lyrics | null> {
    try {
      const raw = await readFile(this.file(join('lyrics', `${trackId}.json`)), 'utf8');
      const value = JSON.parse(raw) as Lyrics;
      if (!Array.isArray(value.lines) || !value.lines.length) return null;
      if (Date.now() - (value.at ?? 0) > FRESH_MS) return null;
      return { ...value, trackId };
    } catch {
      return null;
    }
  }

  private async store(lyrics: Lyrics): Promise<void> {
    try {
      await mkdir(this.file('lyrics'), { recursive: true });
      await writeFile(this.file(join('lyrics', `${lyrics.trackId}.json`)), JSON.stringify(lyrics), 'utf8');
    } catch {
      // 缓存写不进去不影响本次跟唱。
    }
  }

  private async fetch(track: Track): Promise<Lyrics | null | 'error'> {
    let hits = await this.search((url) => {
      url.searchParams.set('track_name', track.name);
      url.searchParams.set('artist_name', track.artist);
    });
    if (hits === 'error') return 'error';
    if (!hits.length) {
      const loose = await this.search((url) => url.searchParams.set('q', `${track.name} ${track.artist}`.trim()));
      if (loose === 'error') return 'error';
      hits = loose;
    }
    const best = pickBest(hits, track);
    if (!best?.syncedLyrics) return null;
    const lines = parseLrc(best.syncedLyrics);
    return lines.length ? { trackId: track.id, source: 'lrclib', lines, at: Date.now() } : null;
  }

  /**
   * 一次检索。429 与 5xx 是词库在限流或过载，退避后重试；
   * 其余 4xx 直接算失败，网络异常也算失败（调用方会再试）。
   */
  private async search(params: (url: URL) => void): Promise<Hit[] | 'error'> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      const url = new URL(ENDPOINT);
      params(url);
      try {
        const response = await fetch(url, {
          headers: { 'user-agent': AGENT, accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 429 || response.status >= 500) continue;
        if (!response.ok) return 'error';
        const body = await response.text();
        if (body.length > 1_000_000) return 'error';
        const parsed: unknown = JSON.parse(body);
        return Array.isArray(parsed) ? (parsed as Hit[]) : [];
      } catch {
        continue;
      }
    }
    return 'error';
  }
}
