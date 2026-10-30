// 测试：歌词解析、行定位与剩余时长。

import { describe, expect, it } from 'vitest';
import { indexAt, parseLrc, remaining } from '../src/lyrics/lrc.ts';

describe('parseLrc', () => {
  it('读取多时间标签并跳过元数据与空行', () => {
    const raw = [
      '[ti:Test]',
      '[ar:Nobody]',
      '[00:12.34]第一句',
      '[00:15.00][00:45.00]副歌',
      '[00:20.5]',
      '没有标签的一行',
      '[01:02]最后一句',
    ].join('\n');
    expect(parseLrc(raw)).toEqual([
      { at: 12.34, text: '第一句' },
      { at: 15, text: '副歌' },
      { at: 45, text: '副歌' },
      { at: 62, text: '最后一句' },
    ]);
  });

  it('同一时间出现两句时两句都保留', () => {
    const raw = '[00:10.00]原词\n[00:10.00]译文';
    expect(parseLrc(raw)).toEqual([
      { at: 10, text: '原词' },
      { at: 10, text: '译文' },
    ]);
  });
});

describe('indexAt', () => {
  const lines = [
    { at: 5, text: 'a' },
    { at: 10, text: 'b' },
    { at: 15, text: 'c' },
  ];

  it('首行之前返回 -1', () => {
    expect(indexAt(lines, 4.9)).toBe(-1);
    expect(indexAt(lines, 0)).toBe(-1);
  });

  it('命中每个区间', () => {
    expect(indexAt(lines, 5)).toBe(0);
    expect(indexAt(lines, 9.99)).toBe(0);
    expect(indexAt(lines, 10)).toBe(1);
    expect(indexAt(lines, 99)).toBe(2);
  });

  it('空歌词返回 -1', () => {
    expect(indexAt([], 10)).toBe(-1);
  });
});

describe('remaining', () => {
  const lines = [
    { at: 5, text: 'a' },
    { at: 9, text: 'b' },
  ];

  it('按下一行的时间计算', () => {
    expect(remaining(lines, 0, 200_000, 6)).toBeCloseTo(3);
  });

  it('最后一行按曲目总长计算', () => {
    expect(remaining(lines, 1, 12_000, 10)).toBeCloseTo(2);
  });

  it('总长未知时给一个短窗口', () => {
    expect(remaining(lines, 1, 0, 10)).toBeCloseTo(4);
  });
});
