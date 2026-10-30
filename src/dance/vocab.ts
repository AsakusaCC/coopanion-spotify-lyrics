import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface VocabWord {
  id: string;
  kind: 'expression' | 'motion';
  /** 中文名，写进 pet_say 脚本的词。 */
  name: string;
  /** 播完需要的秒数。 */
  seconds: number;
  /** 保持到下一个动作（坐下、打盹）。 */
  lasting: boolean;
}

export interface Vocab {
  figure: string;
  expressions: VocabWord[];
  motions: VocabWord[];
}

/** 听歌时不用：睡觉是永久睡下，打盹显得走神。 */
const SKIP = new Set(['sleep', 'sleepy']);

interface FigureEntry {
  id?: unknown;
  kind?: unknown;
  seconds?: unknown;
  lasting?: unknown;
  names?: { zh?: unknown };
}

/** 宿主安装目录附近的候选根，用于找桌宠包的 `web/` 与形象文件。 */
export function searchRoots(): string[] {
  const out: string[] = [];
  const push = (value: string | undefined) => {
    if (value && !out.includes(value)) out.push(value);
  };
  push(process.env.COOPANION_ROOT);
  const resources = (process as { resourcesPath?: unknown }).resourcesPath;
  if (typeof resources === 'string') push(resources);
  let dir = dirname(process.execPath);
  for (let i = 0; i < 6; i++) {
    push(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  push(process.cwd());
  return out;
}

function figureWebDirs(roots: readonly string[]): string[] {
  const out: string[] = [];
  const add = (path: string) => {
    if (!out.includes(path)) out.push(path);
  };
  for (const root of roots) {
    add(join(root, 'node_modules', 'cortico-world-desktop-pet', 'web'));
    add(join(root, 'app', 'node_modules', 'cortico-world-desktop-pet', 'web'));
    add(join(root, 'Resources', 'app', 'node_modules', 'cortico-world-desktop-pet', 'web'));
  }
  return out;
}

/** 桌宠 World 在宿主配置里的两项：当前形象与气泡语速。 */
export interface CompanionLook {
  figure: string | null;
  /** 打字速度为 20 × 它；气泡时长按它倒数缩放。 */
  bubbleSpeed: number;
}

export function readCompanion(configFile: string): CompanionLook {
  const fallback: CompanionLook = { figure: null, bubbleSpeed: 1 };
  if (!existsSync(configFile)) return fallback;
  try {
    const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as {
      worlds?: Record<string, { skin?: { figure?: unknown }; window?: { bubbleSpeed?: unknown } }>;
    };
    const pet = parsed.worlds?.['desktop-pet'];
    const figure = pet?.skin?.figure;
    const speed = pet?.window?.bubbleSpeed;
    return {
      figure: typeof figure === 'string' && figure.trim() ? figure.trim() : null,
      bubbleSpeed: typeof speed === 'number' && speed > 0 ? speed : 1,
    };
  } catch {
    return fallback;
  }
}

/** 宿主 companion 配置里的当前形象；读不到时 null。 */
export function activeFigure(configFile: string): string | null {
  return readCompanion(configFile).figure;
}

function parseFigure(figure: string, raw: string): Vocab | null {
  let parsed: { vocab?: unknown };
  try {
    parsed = JSON.parse(raw) as { vocab?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.vocab)) return null;
  const expressions: VocabWord[] = [];
  const motions: VocabWord[] = [];
  for (const item of parsed.vocab as FigureEntry[]) {
    const id = typeof item?.id === 'string' ? item.id : '';
    if (!id || SKIP.has(id)) continue;
    const names = item?.names?.zh;
    const name = Array.isArray(names) ? names.find((n): n is string => typeof n === 'string' && !!n.trim()) : '';
    if (!name) continue;
    const kind = item.kind;
    if (kind !== 'expression' && kind !== 'motion') continue;
    const word: VocabWord = {
      id,
      kind,
      name: name.trim(),
      seconds: typeof item.seconds === 'number' && item.seconds > 0 ? item.seconds : 1,
      lasting: item.lasting === true,
    };
    (kind === 'expression' ? expressions : motions).push(word);
  }
  if (!motions.length) return null;
  return { figure, expressions, motions };
}

/**
 * 读当前形象的表情与动作。形象名来自宿主配置，词表来自桌宠包内的 `figure.json`。
 * 读不到时返回 null，调用方只发言不出动作。
 */
export function readVocab(configFile: string, roots: readonly string[] = searchRoots()): Vocab | null {
  const preferred = activeFigure(configFile);
  const order = preferred ? [preferred, 'whale', 'coo'] : ['whale', 'coo'];
  const dirs = figureWebDirs(roots);
  for (const figure of order) {
    for (const web of dirs) {
      const file = join(web, figure, 'figure.json');
      if (!existsSync(file)) continue;
      try {
        const vocab = parseFigure(figure, readFileSync(file, 'utf8'));
        if (vocab) return vocab;
      } catch {
        // 坏文件继续下一个候选。
      }
    }
  }
  return null;
}

/** 环境提示词里给模型看的词表，只列中文名。 */
export function vocabText(vocab: Vocab | null): string {
  if (!vocab) return '未读取到（只说话，不要写动作）';
  const expressions = vocab.expressions.map((w) => w.name).join('、');
  const motions = vocab.motions.map((w) => w.name).join('、');
  return `表情：${expressions}；动作：${motions}`;
}
