import type { Sample, Track } from '../types.ts';

export interface Transition {
  trackChanged: boolean;
  stateChanged: boolean;
  /** 位置跳变超过 0.8 秒，视为拖动或跳转。 */
  seeked: boolean;
  /** 当前曲目；停止或未运行时为 null。 */
  track: Track | null;
  previousState: Sample['state'];
}

/**
 * 播放状态机：把采样整理成曲目、状态与可外推的位置。
 * 采样间隔 200 ms，两次采样之间用本地时钟外推，误差小于 100 ms。
 */
export class Playback {
  private sample: Sample | null = null;
  private receivedAt = 0;
  private track: Track | null = null;

  update(sample: Sample, now: number): Transition {
    const previous = this.sample;
    const previousPosition = this.position(now);
    const seeked = sample.state === 'playing' && previous?.state === 'playing'
      && Math.abs((sample.position ?? 0) - previousPosition) > 0.8;
    this.sample = sample;
    this.receivedAt = now;
    const next = sample.state === 'playing' || sample.state === 'paused'
      ? trackOf(sample)
      : null;
    const trackChanged = (next?.id ?? '') !== (this.track?.id ?? '');
    this.track = next;
    return {
      trackChanged,
      stateChanged: (previous?.state ?? 'absent') !== sample.state || trackChanged,
      seeked,
      track: this.track,
      previousState: previous?.state ?? 'absent',
    };
  }

  /** 当前播放位置，秒；暂停时冻结在最后一次采样值。 */
  position(now = Date.now()): number {
    const sample = this.sample;
    if (!sample) return 0;
    const base = sample.position ?? 0;
    if (sample.state !== 'playing') return base;
    const live = base + (now - this.receivedAt) / 1000;
    const total = (sample.durationMs ?? 0) / 1000;
    return total > 0 ? Math.min(live, total) : live;
  }

  get playing(): boolean {
    return this.sample?.state === 'playing';
  }

  get state(): Sample['state'] {
    return this.sample?.state ?? 'absent';
  }

  get current(): Track | null {
    return this.track;
  }

  get error(): string {
    return this.sample?.state === 'error' ? this.sample.message ?? '读取失败' : '';
  }
}

export function trackOf(sample: Sample): Track {
  return {
    id: sample.id ?? '',
    name: sample.name ?? '',
    artist: sample.artist ?? '',
    album: sample.album ?? '',
    durationMs: sample.durationMs ?? 0,
  };
}
