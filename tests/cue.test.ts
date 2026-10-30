// 测试：截断、动作标记与脚本拼接。

import { describe, expect, it } from 'vitest';
import { actIds, bubbleSeconds, buildScript, clip, cueText, marker, padToSeconds, renderBeats } from '../src/dance/cue.ts';
import type { VocabWord } from '../src/dance/vocab.ts';

const happy: VocabWord = { id: 'happy', kind: 'expression', name: '开心', seconds: 1, lasting: false };
const dance: VocabWord = { id: 'dance', kind: 'motion', name: '跳舞', seconds: 3.4, lasting: false };

describe('clip', () => {
  it('短句原样返回', () => {
    expect(clip('今天也要大声唱', 40)).toBe('今天也要大声唱');
  });

  it('按标点截断', () => {
    expect(clip('第一句，第二句，第三句很长很长', 8)).toBe('第一句，第二句…');
  });

  it('没有合适断点时硬切并补省略号', () => {
    expect(clip('aaaaaaaaaaaaaaaaaaaa', 8)).toBe('aaaaaaa…');
  });

  it('压缩空白', () => {
    expect(clip('  a   b  ', 40)).toBe('a b');
  });
});

describe('marker 与 buildScript', () => {
  it('用内联标记，不用会开新气泡的【】', () => {
    expect(marker({ expression: happy, motion: dance })).toBe('<开心, 跳舞>');
  });

  it('只有动作时标记省略表情', () => {
    expect(marker({ expression: null, motion: dance })).toBe('<跳舞>');
  });

  it('标记在前，歌词在后', () => {
    expect(buildScript('今天也要大声唱', { expression: happy, motion: dance }, 40, true))
      .toBe('<开心, 跳舞>今天也要大声唱');
  });

  it('关闭歌词显示时只剩标记', () => {
    expect(buildScript('今天也要大声唱', { expression: happy, motion: dance }, 40, false))
      .toBe('<开心, 跳舞>');
  });

  it('没有词表时只给歌词', () => {
    expect(buildScript('今天也要大声唱', { expression: null, motion: null }, 40, true))
      .toBe('今天也要大声唱');
  });
});

describe('尾部动作标记', () => {
  it('接续动作写在歌词之后，不出现在气泡文字里', () => {
    expect(buildScript('今天也要大声唱', { expression: happy, motion: dance }, 40, true, dance))
      .toBe('<开心, 跳舞>今天也要大声唱<跳舞>');
  });

  it('没有接续动作时脚本不变', () => {
    expect(buildScript('今天也要大声唱', { expression: happy, motion: dance }, 40, true, null))
      .toBe('<开心, 跳舞>今天也要大声唱');
  });
});

describe('bubbleSeconds', () => {
  it('复刻桌宠的估算：动作段 0.5 秒，文字按 20 字/秒加停留', () => {
    expect(bubbleSeconds('abcdefghij', 1, true)).toBeCloseTo(0.5 + (0.5 + 1.6 + 0.7), 1);
  });

  it('气泡语速越小，气泡越久', () => {
    expect(bubbleSeconds('abcdefghij', 0.5, true)).toBeGreaterThan(bubbleSeconds('abcdefghij', 1, true));
  });

  it('与桌宠回执同一口径：14 字、语速 1.75 约 2.4 秒', () => {
    expect(bubbleSeconds('幽閉利口逝く前にユーヘイじゃ', 1.75, true)).toBeCloseTo(2.4, 1);
  });

  it('只有动作没有文字时只算动作段', () => {
    expect(bubbleSeconds('', 1, true)).toBe(0.5);
  });
});

describe('padToSeconds', () => {
  it('补到目标时长', () => {
    const padded = padToSeconds('短句', 6, 1, true);
    expect(bubbleSeconds(padded, 1, true)).toBeGreaterThanOrEqual(6);
    expect(padded.startsWith('短句')).toBe(true);
  });

  it('本来就够长时不补', () => {
    expect(padToSeconds('这一句已经足够长了', 2, 1, true)).toBe('这一句已经足够长了');
  });

  it('语速越快补得越多', () => {
    expect(padToSeconds('短句', 6, 2, true).length).toBeGreaterThan(padToSeconds('短句', 6, 1, true).length);
  });
});

describe('renderBeats', () => {
  const plan = (text: string, target: number, tails = 0) => ({ text, target, chart: { expression: happy, motion: dance }, tails });

  it('第一句用内联标记，后面每句用【】开新气泡', () => {
    const script = renderBeats([plan('第一句', 2), plan('第二句', 2)], 40, true, 1);
    expect(script.startsWith('<开心, 跳舞>第一句')).toBe(true);
    expect(script).toContain('【开心, 跳舞】第二句');
  });

  it('续舞标记按尾巴数目重复', () => {
    const script = renderBeats([plan('一句', 9, 2)], 40, true, 1);
    expect(script.match(/<跳舞>/g)?.length).toBe(2);
  });

  it('关闭歌词显示时只剩动作', () => {
    const script = renderBeats([plan('第一句', 2)], 40, false, 1);
    expect(script).not.toContain('第一句');
    expect(script).toContain('<开心, 跳舞>');
  });
});

describe('actIds', () => {
  it('给出英文 id，供 pet_act 使用', () => {
    expect(actIds({ expression: happy, motion: dance })).toEqual(['happy', 'dance']);
  });
});

describe('cueText', () => {
  it('正文包含一行可直接照抄的脚本', () => {
    const text = cueText('<开心, 跳舞>今天也要大声唱');
    expect(text).toContain('pet_say');
    expect(text.split('\n').at(-1)).toBe('<开心, 跳舞>今天也要大声唱');
  });
});
