// 测试：NDJSON 解析、授权判断与位置外推。

import { describe, expect, it } from 'vitest';
import { denied, parseSample } from '../src/reader/jxa.ts';
import { Playback } from '../src/reader/state.ts';
import type { Sample } from '../src/types.ts';

const playing: Sample = {
  at: 0,
  state: 'playing',
  id: 'abc',
  name: 'Returns',
  artist: 'Poppin Party',
  album: 'Breakthrough',
  durationMs: 323_169,
  position: 10,
};

describe('parseSample', () => {
  it('解析完整行', () => {
    expect(parseSample(JSON.stringify(playing))).toEqual(playing);
  });

  it('坏行与未知状态返回 null', () => {
    expect(parseSample('not json')).toBeNull();
    expect(parseSample('[]')).toBeNull();
    expect(parseSample('{"state":"weird"}')).toBeNull();
  });

  it('缺 id 的曲目行按错误处理', () => {
    expect(parseSample('{"state":"playing","position":1}')?.state).toBe('error');
  });

  it('absent 与 stopped 不带曲目字段', () => {
    expect(parseSample('{"state":"absent","at":5}')).toEqual({ at: 5, state: 'absent' });
  });
});

describe('denied', () => {
  it('认得 -1743', () => {
    expect(denied('Not authorized to send Apple events to Spotify. (-1743)')).toBe(true);
    expect(denied('osascript: 1743')).toBe(true);
    expect(denied('something else')).toBe(false);
  });
});

describe('Playback', () => {
  it('播放时按本地时钟外推位置', () => {
    const playback = new Playback();
    playback.update(playing, 1000);
    expect(playback.position(1500)).toBeCloseTo(10.5);
  });

  it('暂停时位置冻结', () => {
    const playback = new Playback();
    playback.update({ ...playing, state: 'paused' }, 1000);
    expect(playback.position(9000)).toBeCloseTo(10);
  });

  it('位置不会外推超过曲目总长', () => {
    const playback = new Playback();
    playback.update({ ...playing, position: 320 }, 1000);
    expect(playback.position(90_000)).toBeCloseTo(323.169);
  });

  it('切歌给出 trackChanged', () => {
    const playback = new Playback();
    playback.update(playing, 1000);
    const transition = playback.update({ ...playing, id: 'def', name: 'Other' }, 1200);
    expect(transition.trackChanged).toBe(true);
    expect(transition.track?.name).toBe('Other');
  });

  it('位置跳变超过 0.8 秒判为拖动', () => {
    const playback = new Playback();
    playback.update(playing, 1000);
    expect(playback.update({ ...playing, position: 40 }, 1200).seeked).toBe(true);
  });

  it('位置连续推进不算拖动', () => {
    const playback = new Playback();
    playback.update(playing, 1000);
    expect(playback.update({ ...playing, position: 10.2 }, 1200).seeked).toBe(false);
  });

  it('暂停时切歌不会误判为拖动', () => {
    const playback = new Playback();
    playback.update({ ...playing, state: 'paused' }, 1000);
    expect(playback.update({ ...playing, state: 'paused', position: 60 }, 1200).seeked).toBe(false);
  });
});
