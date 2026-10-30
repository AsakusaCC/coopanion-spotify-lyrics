import type { Vocab, VocabWord } from './vocab.ts';

export interface Chart {
  expression: VocabWord | null;
  motion: VocabWord | null;
}

export type Intensity = 1 | 2 | 3;

const MOTION_PREFERENCE: Record<Intensity, readonly string[]> = {
  1: ['nod', 'look', 'sit', 'shake', 'stand'],
  2: ['dance', 'hop', 'wave', 'nod', 'flap'],
  3: ['dance', 'flap', 'spin', 'jump', 'hop'],
};

const EXPRESSION_PREFERENCE: Record<Intensity, readonly string[]> = {
  1: ['neutral', 'thinking', 'wink', 'sad'],
  2: ['happy', 'excited', 'wink', 'love'],
  3: ['excited', 'happy', 'smug', 'surprised'],
};

/**
 * 这一句的强度：字密度决定基础档，感叹与问句再抬一档。
 * 不做副歌识别——没有可靠的音频特征来源，宁可只给可解释的量。
 */
export function intensityOf(text: string, seconds: number): Intensity {
  const density = text.length / Math.max(1, seconds);
  let level: number = density >= 4.2 ? 3 : density >= 2.2 ? 2 : 1;
  if (level < 3 && /[!！?？…]/.test(text)) level += 1;
  return level as Intensity;
}

function first(words: readonly VocabWord[], order: readonly string[], avoid: readonly string[]): VocabWord | null {
  const pick = (respectAvoid: boolean): VocabWord | undefined => {
    for (const id of order) {
      const hit = words.find((w) => w.id === id && !(respectAvoid && avoid.includes(w.id)));
      if (hit) return hit;
    }
    return undefined;
  };
  return pick(true) ?? pick(false) ?? words.find((w) => !avoid.includes(w.id)) ?? words[0] ?? null;
}

/**
 * 按强度和当前形象选一组表情 + 动作。
 *
 * `danceAlways` 时动作固定用跳舞：桌宠重复触发同一个动作会沿用同一个相位接着摇摆，
 * 不会从头重播，这是把舞蹈接成连续的关键。否则按强度偏好轮换，最近用过的排后面。
 */
export function chooseChart(
  vocab: Vocab | null,
  intensity: Intensity,
  recent: readonly string[] = [],
  danceAlways = false,
): Chart {
  if (!vocab) return { expression: null, motion: null };
  const keepDancing = danceAlways ? vocab.motions.find((w) => w.id === 'dance') : undefined;
  return {
    expression: first(vocab.expressions, EXPRESSION_PREFERENCE[intensity], recent),
    motion: keepDancing ?? first(vocab.motions, MOTION_PREFERENCE[intensity], recent),
  };
}

/** 配置里的强制强度覆盖自动判断。 */
export function forcedIntensity(value: unknown): Intensity | null {
  if (value === 'soft') return 1;
  if (value === 'normal') return 2;
  if (value === 'hype') return 3;
  return null;
}
