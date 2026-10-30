// 测试：词库限流时的重试与宽松回退。

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LyricsStore } from '../src/lyrics/lrclib.ts';
import type { Track } from '../src/types.ts';

const track: Track = {
  id: 'this-game',
  name: 'This game (Cover)',
  artist: 'Roselia',
  album: 'バンドリ！ カバーコレクションVol.3',
  durationMs: 283_633,
};

const hit = {
  trackName: 'This game (Cover)',
  artistName: 'Roselia',
  albumName: 'x',
  duration: 284,
  syncedLyrics: '[00:41.34]回り続ける 歯車には成り下がらない\n[00:49.01]平均演じる',
};

const store = () => new LyricsStore(mkdtempSync(join(tmpdir(), 'lyrics-retry-')));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LyricsStore 的重试', () => {
  it('503 后重试一次成功', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? new Response('busy', { status: 503 })
        : new Response(JSON.stringify([hit]), { status: 200 });
    }));
    const lyrics = await store().load(track, 'auto');
    expect(lyrics?.lines.length).toBe(2);
    expect(calls).toBe(2);
  });

  it('连续 5xx 记失败缓存，但 force 能立刻再试', async () => {
    let status = 503;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status })));
    const lyrics = store();
    expect(await lyrics.load(track, 'auto')).toBeNull();
    expect(await lyrics.load(track, 'auto')).toBeNull();

    status = 200;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([hit]), { status: 200 })));
    expect(await lyrics.load(track, 'auto')).toBeNull();
    expect(await lyrics.load(track, 'auto', true)).not.toBeNull();
  });

  it('结构化检索没有结果时用 q= 再搜一次', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      urls.push(url.href);
      return new Response(JSON.stringify(url.searchParams.has('q') ? [hit] : []), { status: 200 });
    }));
    const lyrics = await store().load(track, 'auto');
    expect(lyrics).not.toBeNull();
    expect(urls.length).toBe(2);
    expect(urls[1]).toContain('q=');
  });

  it('请求不带专辑名', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      urls.push(url.href);
      return new Response(JSON.stringify([hit]), { status: 200 });
    }));
    await store().load(track, 'auto');
    expect(urls[0]).not.toContain('album_name');
  });
});
