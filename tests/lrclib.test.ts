// 测试：LRCLIB 结果评分与挑选。

import { describe, expect, it } from 'vitest';
import { normalizeText, pickBest, score } from '../src/lyrics/lrclib.ts';
import type { Track } from '../src/types.ts';

const track: Track = {
  id: 'abc',
  name: 'Yesterday',
  artist: 'The Beatles',
  album: 'Help!',
  durationMs: 125_000,
};

describe('normalizeText', () => {
  it('去掉括号内容、大小写与标点', () => {
    expect(normalizeText('Yesterday (Remastered 2009)')).toBe('yesterday');
    expect(normalizeText('The-Beatles')).toBe('thebeatles');
  });
});

describe('score', () => {
  it('没有同步歌词直接判负', () => {
    expect(score({ syncedLyrics: null }, track)).toBeLessThan(0);
  });

  it('时长接近、歌手与专辑一致时最高', () => {
    const close = score({ syncedLyrics: '[00:01]a', duration: 124, artistName: 'The Beatles', albumName: 'Help!', trackName: 'Yesterday' }, track);
    const far = score({ syncedLyrics: '[00:01]a', duration: 180, artistName: 'Other', albumName: 'Other', trackName: 'Yesterday' }, track);
    expect(close).toBeGreaterThan(far);
  });
});

describe('pickBest', () => {
  it('同名不同版本按时长取更近的', () => {
    const hits = [
      { trackName: 'Yesterday', artistName: 'The Beatles', albumName: 'Help!', duration: 125, syncedLyrics: '[00:01]a' },
      { trackName: 'Yesterday', artistName: 'The Beatles', albumName: 'Love', duration: 206, syncedLyrics: '[00:01]b' },
    ];
    expect(pickBest(hits, track)?.duration).toBe(125);
  });

  it('都不合格时返回 null', () => {
    expect(pickBest([{ trackName: 'Yesterday', duration: 125, syncedLyrics: null }], track)).toBeNull();
    expect(pickBest([], track)).toBeNull();
  });

  it('专辑与元数据缺失时仍可按歌名歌手取一条', () => {
    const hits = [{ trackName: 'Yesterday', artistName: 'The Beatles', duration: 125, syncedLyrics: '[00:01]a' }];
    expect(pickBest(hits, track)).not.toBeNull();
  });
});
