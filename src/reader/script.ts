/**
 * 常驻 JXA 源码：每 `pollMs` 毫秒向 stdout 写一行 NDJSON。
 *
 * 采样间隔与 Spotify 是否运行由它自己判断，Node 侧只解析行，不再 spawn：
 * 一次性 osascript 每次约 210 ms，常驻后每行几十毫秒。
 * 每轮只读播放状态与位置；曲目字段每 4 轮（约 1 秒）核对一次 id，
 * 变了才重读，省掉一半 Apple Event 往返。
 */
export function jxaSource(pollMs: number): string {
  const poll = Math.max(100, Math.min(1000, Math.round(pollMs || 200)));
  return `ObjC.import('Foundation');
ObjC.import('AppKit');

const out = $.NSFileHandle.fileHandleWithStandardOutput;
const emit = (o) => out.writeData($(JSON.stringify(o) + '\\n').dataUsingEncoding(4));
const POLL = ${poll};
const BUNDLE = 'com.spotify.client';
const running = () => Number($.NSRunningApplication.runningApplicationsWithBundleIdentifier(BUNDLE).count) > 0;

let spotify = null;
let tick = 0;
let present = null;
let marker = '';
let lastError = '';
let meta = null;

while (true) {
  const at = Date.now();
  if (tick % 5 === 0 || present === null) present = running();
  const probeMeta = tick % 4 === 0;
  tick++;
  if (!present) {
    if (marker !== 'absent') { marker = 'absent'; lastError = ''; meta = null; emit({ at: at, state: 'absent' }); }
  } else {
    try {
      if (!spotify) spotify = Application('Spotify');
      const state = String(spotify.playerState());
      if (state === 'stopped') {
        if (marker !== 'stopped') { marker = 'stopped'; lastError = ''; meta = null; emit({ at: at, state: 'stopped' }); }
      } else {
        if (!meta || probeMeta) {
          const track = spotify.currentTrack();
          const uri = String(track.spotifyUrl() || '');
          const id = uri.slice(uri.lastIndexOf(':') + 1);
          if (!meta || meta.id !== id) {
            meta = {
              id: id,
              name: String(track.name()),
              artist: String(track.artist()),
              album: String(track.album()),
              durationMs: Number(track.duration()),
            };
          }
        }
        marker = 'track';
        lastError = '';
        emit({
          at: at,
          state: state,
          id: meta.id,
          name: meta.name,
          artist: meta.artist,
          album: meta.album,
          durationMs: meta.durationMs,
          position: Number(spotify.playerPosition()),
        });
      }
    } catch (err) {
      const message = String((err && err.message) || err);
      if (message !== lastError) { lastError = message; present = null; meta = null; emit({ at: at, state: 'error', message: message }); }
    }
  }
  delay(POLL / 1000);
}
`;
}
