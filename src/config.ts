import type { ConfigGroup } from 'cortico/core/types.ts';

export type CueMode = 'sing' | 'off' | 'listen';

/** `worlds['spotify-lyrics']` 段。 */
export interface SpotifyConfig {
  enabled: boolean;
  /** `listen` 只占位，v1 按 `off` 处理。 */
  cueMode: CueMode;
  /** 播放期间让桌宠一直跳，靠追加的动作标记把舞蹈接上。 */
  continuousDance: boolean;
  /** 一次 pet_say 里放几句歌词。桌宠是队列，批量下发才能跟上快歌。 */
  batchLines: number;
  /** 一次下发最多盖住多少秒歌词。 */
  batchSeconds: number;
  leadSeconds: number;
  maxChars: number;
  showLyricText: boolean;
  intensity: 'auto' | 'soft' | 'normal' | 'hype';
  lyricsSource: 'auto' | 'local' | 'off';
  quietHours: boolean;
  quietStart: number;
  quietEnd: number;
  /** 采样间隔，改动需要重启 World。 */
  pollMs: number;
}

export const defaults = (): SpotifyConfig => ({
  enabled: false,
  cueMode: 'sing',
  continuousDance: true,
  batchLines: 3,
  batchSeconds: 12,
  leadSeconds: 0.2,
  maxChars: 40,
  showLyricText: true,
  intensity: 'auto',
  lyricsSource: 'auto',
  quietHours: false,
  quietStart: 0,
  quietEnd: 0,
  pollMs: 200,
});

const clamp = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

/** 越界值收进范围，未知枚举退回默认；配置热更新后每次读都过一遍。 */
export function normalize(cfg: SpotifyConfig): SpotifyConfig {
  const base = defaults();
  return {
    enabled: cfg.enabled === true,
    cueMode: cfg.cueMode === 'off' || cfg.cueMode === 'listen' ? cfg.cueMode : 'sing',
    continuousDance: cfg.continuousDance !== false,
    batchLines: clamp(cfg.batchLines, base.batchLines, 1, 4),
    batchSeconds: clamp(cfg.batchSeconds, base.batchSeconds, 4, 30),
    leadSeconds: typeof cfg.leadSeconds === 'number' && Number.isFinite(cfg.leadSeconds)
      ? Math.max(0, Math.min(4, cfg.leadSeconds)) : base.leadSeconds,
    maxChars: clamp(cfg.maxChars, base.maxChars, 8, 60),
    showLyricText: cfg.showLyricText !== false,
    intensity: cfg.intensity === 'soft' || cfg.intensity === 'normal' || cfg.intensity === 'hype' ? cfg.intensity : 'auto',
    lyricsSource: cfg.lyricsSource === 'local' || cfg.lyricsSource === 'off' ? cfg.lyricsSource : 'auto',
    quietHours: cfg.quietHours === true,
    quietStart: clamp(cfg.quietStart, 0, 0, 23),
    quietEnd: clamp(cfg.quietEnd, 0, 0, 23),
    pollMs: clamp(cfg.pollMs, base.pollMs, 100, 1000),
  };
}

/** World 页的设置表单。键是 cfg 的完整点分路径，必须落在 worlds.<id>. 段内。 */
const PREFIX = 'worlds.spotify-lyrics.';

export const configGroups: ConfigGroup[] = [
  {
    id: 'world:spotify-lyrics:sing',
    owner: 'world:spotify-lyrics',
    schema: {
      type: 'object',
      title: '跟唱',
      description: '每句歌词让桌宠念出来并做一个动作。',
      properties: {
        [`${PREFIX}cueMode`]: {
          type: 'string',
          title: '模式',
          description: '关掉后不再推送跟唱事件。',
          enum: ['sing', 'off'],
        },
        [`${PREFIX}continuousDance`]: { type: 'boolean', title: '一直跳舞', description: '播放期间接上动作，只在切歌间隙停下。' },
        [`${PREFIX}batchLines`]: { type: 'integer', title: '每次唱几句', description: '桌宠按队列播放，一次多给几句才跟得上快歌。', minimum: 1, maximum: 4 },
        [`${PREFIX}batchSeconds`]: { type: 'integer', title: '每次覆盖时长', description: '一次下发最多盖住多少秒歌词。', minimum: 4, maximum: 30, 'x-suffix': '秒' },
        [`${PREFIX}leadSeconds`]: { type: 'number', title: '提前量', description: '在歌词行开始前多少秒发出，抵消模型延迟；歌词总慢半拍就调大。', minimum: 0, maximum: 4, multipleOf: 0.1, 'x-suffix': '秒' },
        [`${PREFIX}maxChars`]: { type: 'integer', title: '单行字数上限', description: '超出按标点截断。', minimum: 8, maximum: 60 },
        [`${PREFIX}showLyricText`]: { type: 'boolean', title: '气泡显示歌词', description: '关掉后只做动作。' },
        [`${PREFIX}intensity`]: { type: 'string', title: '动作强度', enum: ['auto', 'soft', 'normal', 'hype'] },
      },
    },
  },
  {
    id: 'world:spotify-lyrics:source',
    owner: 'world:spotify-lyrics',
    schema: {
      type: 'object',
      title: '歌词与安静时段',
      description: '歌词来自 LRCLIB；自备的 lrc 文件优先。',
      properties: {
        [`${PREFIX}lyricsSource`]: { type: 'string', title: '歌词来源', enum: ['auto', 'local', 'off'] },
        [`${PREFIX}quietHours`]: { type: 'boolean', title: '安静时段', description: '时段内不推送跟唱。' },
        [`${PREFIX}quietStart`]: { type: 'integer', title: '开始', minimum: 0, maximum: 23, 'x-suffix': '时' },
        [`${PREFIX}quietEnd`]: { type: 'integer', title: '结束', minimum: 0, maximum: 23, 'x-suffix': '时' },
        [`${PREFIX}pollMs`]: { type: 'integer', title: '采样间隔', description: '改动后需重启 World。', minimum: 100, maximum: 1000, 'x-suffix': '毫秒', 'x-hot': false },
      },
    },
  },
];
