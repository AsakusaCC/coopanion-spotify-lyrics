// 测试：强度判断与动作选择。

import { describe, expect, it } from 'vitest';
import { chooseChart, forcedIntensity, intensityOf } from '../src/dance/chart.ts';
import type { Vocab, VocabWord } from '../src/dance/vocab.ts';

const word = (id: string, kind: 'expression' | 'motion', name: string): VocabWord =>
  ({ id, kind, name, seconds: 1, lasting: false });

const vocab: Vocab = {
  figure: 'whale',
  expressions: [word('neutral', 'expression', '平静'), word('happy', 'expression', '开心'), word('excited', 'expression', '期待')],
  motions: [word('nod', 'motion', '点头'), word('dance', 'motion', '跳舞'), word('flap', 'motion', '扑腾')],
};

describe('intensityOf', () => {
  it('字密度低是安静档', () => {
    expect(intensityOf('嗯', 4)).toBe(1);
  });

  it('字密度中等是正常档', () => {
    expect(intensityOf('今天也要大声唱出来呀', 4)).toBe(2);
  });

  it('字密度高是高涨档', () => {
    expect(intensityOf('今天也要大声唱出来呀啊啊啊', 3)).toBe(3);
  });

  it('感叹号抬一档，但不超过三档', () => {
    expect(intensityOf('唱！', 2)).toBe(2);
    expect(intensityOf('今天也要大声唱出来呀啊啊啊！', 3)).toBe(3);
  });
});

describe('chooseChart', () => {
  it('按强度取偏好动作', () => {
    expect(chooseChart(vocab, 2).motion?.id).toBe('dance');
    expect(chooseChart(vocab, 1).motion?.id).toBe('nod');
  });

  it('最近用过的动作排到后面', () => {
    expect(chooseChart(vocab, 2, ['dance']).motion?.id).toBe('nod');
  });

  it('没有词表时不给动作', () => {
    expect(chooseChart(null, 3)).toEqual({ expression: null, motion: null });
  });

  it('词表缺项时退回可用项', () => {
    const small: Vocab = { figure: 'x', expressions: [], motions: [word('hop', 'motion', '小跳')] };
    expect(chooseChart(small, 3)).toEqual({ expression: null, motion: small.motions[0] });
  });
});

describe('forcedIntensity', () => {
  it('只认三个枚举值', () => {
    expect(forcedIntensity('soft')).toBe(1);
    expect(forcedIntensity('normal')).toBe(2);
    expect(forcedIntensity('hype')).toBe(3);
    expect(forcedIntensity('auto')).toBeNull();
  });
});
