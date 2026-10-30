import type { Chart } from './chart.ts';
import type { VocabWord } from './vocab.ts';

const BREAK = /[，。！？、,.!?；;：:~～\s]/;

/** 按标点截断到上限；找不到合适断点时硬切并补省略号。 */
export function clip(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const limit = Math.max(4, Math.round(maxChars));
  if (flat.length <= limit) return flat;
  const head = flat.slice(0, limit);
  let cut = -1;
  for (let i = 0; i < head.length; i++) if (BREAK.test(head[i])) cut = i;
  if (cut >= Math.floor(limit * 0.5)) return `${head.slice(0, cut).trim()}…`;
  return `${head.slice(0, limit - 1).trimEnd()}…`;
}

/** `【】` 会开新气泡，`<>` 不会；跟唱只要一个气泡，所以用内联标记。 */
export function marker(chart: Chart): string {
  const words = [chart.expression?.name, chart.motion?.name].filter((w): w is string => !!w);
  return words.length ? `<${words.join(', ')}>` : '';
}

/**
 * pet_say 的 script：内联动作标记在前，歌词在中，可选的续舞标记在末尾。
 *
 * 末尾的标记在打字到达句末时才触发，用来把 3.2 秒的舞蹈接上，播放期间不站定。
 * 标记不出现在气泡文字里。
 */
export function buildScript(
  text: string,
  chart: Chart,
  maxChars: number,
  showText: boolean,
  tail: VocabWord | null = null,
  repeats = 1,
): string {
  const tag = marker(chart);
  const body = showText ? clip(text, maxChars) : '';
  const hold = tail ? marker({ expression: null, motion: tail }).repeat(Math.max(1, Math.min(3, Math.round(repeats)))) : '';
  return `${tag}${body}${hold}`;
}

/** 一次 pet_say 里的一句：歌词、它在歌里的时长、表情动作、续舞段数。 */
export interface BeatPlan {
  text: string;
  /** 这一句在歌里占多少秒。 */
  target: number;
  chart: Chart;
  /** 追加几个续舞标记。 */
  tails: number;
}

/**
 * 桌宠一段气泡预计显示多久，与桌宠的 `estimateSeconds` 同一口径：
 * 有动作的段加 0.5 秒，文字按 20 字/秒打字并加 1.6 秒与每字 0.07 秒的停留，
 * 整体再除以气泡语速 `bubbleSpeed`。
 */
export function bubbleSeconds(visibleText: string, speed = 1, withActions = true): number {
  const length = visibleText.trim().length;
  const rate = Math.max(0.2, speed);
  const typing = length ? (length / 20 + 1.6 + length * 0.07) / rate : 0;
  return Math.round(((withActions ? 0.5 : 0) + typing) * 10) / 10;
}

/**
 * 把气泡抳到 `target` 秒：追加零宽空格（U+200B），它们计数但不显形。
 * 桌宠只按字符数估时，不补位的话短句还没唱完气泡就关了。
 */
export function padToSeconds(text: string, target: number, speed = 1, withActions = true): string {
  if (!text || target <= 0) return text;
  const base = bubbleSeconds(text, speed, withActions);
  if (target <= base) return text;
  const per = (1 / 20 + 0.07) / Math.max(0.2, speed);
  const count = Math.min(200, Math.ceil((target - base) / per));
  return `${text}${'\u200B'.repeat(count)}`;
}

/**
 * 一次 pet_say 的多句脚本。第一句用内联标记起泡，之后每句用 `【】` 开新气泡，
 * 桌宠会按顺序把这几句接看下去，模型一次输出就能唱好几句。
 */
export function renderBeats(plans: readonly BeatPlan[], maxChars: number, showText: boolean, speed = 1): string {
  return plans.map((plan, index) => {
    const body = showText ? clip(plan.text, maxChars) : '';
    const padded = body ? padToSeconds(body, plan.target, speed, true) : '';
    const words = [plan.chart.expression?.name, plan.chart.motion?.name].filter((w): w is string => !!w);
    const head = words.length ? (index === 0 ? `<${words.join(', ')}>` : `【${words.join(', ')}】`) : index === 0 ? '' : '【】';
    const tail = plan.chart.motion && plan.tails > 0
      ? `<${plan.chart.motion.name}>`.repeat(Math.max(1, Math.min(3, Math.round(plan.tails))))
      : '';
    return `${head}${padded}${tail}`;
  }).join('');
}

/** pet_act 的动作列表，按英文 id 给，桌宠两种写法都认。 */
export function actIds(chart: Chart): string[] {
  return [chart.expression?.id, chart.motion?.id].filter((id): id is string => !!id);
}

/** 事件正文：一句指令加一行脚本，模型不需要再调工具或拼接。 */
export function cueText(script: string, lines = 1, leftSeconds = 0): string {
  const count = lines > 1 ? `下面这 ${lines} 句` : '下面这一句';
  const left = leftSeconds > 0 ? `（第一句还剩 ${leftSeconds.toFixed(1)} 秒）` : '';
  return `跟唱：调用 pet_say，script 照抄${count}，不改写、不解释${left}：\n${script}`;
}

/** 无歌词时的纯动作事件正文。 */
export function actText(ids: readonly string[]): string {
  return `跟唱：直接调用 pet_act，actions 用 ${JSON.stringify(ids)}，不要说话。`;
}
