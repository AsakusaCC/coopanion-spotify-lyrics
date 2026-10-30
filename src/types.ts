/** 播放器一次采样的形状，来自 JXA 进程输出的一行 NDJSON。 */
export interface Sample {
  /** 采样时刻，JXA 进程的本地毫秒时间戳。 */
  at: number;
  state: 'playing' | 'paused' | 'stopped' | 'absent' | 'error';
  /** `spotify:track:<id>` 的最后一段；只有 playing/paused 时存在。 */
  id?: string;
  name?: string;
  artist?: string;
  album?: string;
  /** 曲目总长，毫秒。 */
  durationMs?: number;
  /** 播放位置，秒。 */
  position?: number;
  /** state=error 时的原始错误文本。 */
  message?: string;
}

/** 一首曲目的稳定身份；`id` 是 Spotify track id。 */
export interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationMs: number;
}

/** 一行带时间标签的歌词。`at` 是秒。 */
export interface LyricLine {
  at: number;
  text: string;
}

/** 一首曲目的歌词查询结果。 */
export interface Lyrics {
  trackId: string;
  source: 'local' | 'lrclib';
  lines: LyricLine[];
  /** 取回时刻，毫秒。 */
  at: number;
}
