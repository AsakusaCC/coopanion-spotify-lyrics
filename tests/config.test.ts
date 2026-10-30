// 测试：配置归一化。

import { describe, expect, it } from 'vitest';
import { defaults, normalize } from '../src/config.ts';

describe('normalize', () => {
  it('默认值本身是合法的', () => {
    expect(normalize(defaults())).toEqual(defaults());
  });

  it('把越界数值收进范围', () => {
    const cfg = { ...defaults(), batchLines: 99, batchSeconds: -5, maxChars: 1000, leadSeconds: 9, pollMs: 5 };
    expect(normalize(cfg)).toMatchObject({
      batchLines: 4,
      batchSeconds: 4,
      maxChars: 60,
      leadSeconds: 4,
      pollMs: 100,
    });
  });

  it('未知枚举退回默认', () => {
    const cfg = { ...defaults(), intensity: 'wild' as never, lyricsSource: 'web' as never };
    expect(normalize(cfg)).toMatchObject({ intensity: 'auto', lyricsSource: 'auto' });
  });

  it('showLyricText 缺省为开', () => {
    expect(normalize({ ...defaults(), showLyricText: undefined as never }).showLyricText).toBe(true);
    expect(normalize({ ...defaults(), showLyricText: false }).showLyricText).toBe(false);
  });

  it('安静时段的小时数被限制在 0–23', () => {
    expect(normalize({ ...defaults(), quietStart: 30, quietEnd: -2 })).toMatchObject({ quietStart: 23, quietEnd: 0 });
  });
});
