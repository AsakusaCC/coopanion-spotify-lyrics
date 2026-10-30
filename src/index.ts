import { join } from 'node:path';
import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { defaults, normalize, type SpotifyConfig } from './config.ts';
import { searchRoots } from './dance/vocab.ts';
import { events, SpotifyLyricsWorld, toolDecls } from './world.ts';

const summaries = {
  spotify_now_playing: {
    zh: '读取本机 Spotify 的曲目、播放位置、歌词状态与当前行。',
    en: 'Read the observed Spotify track, position and current lyric line.',
  },
  spotify_lyrics_window: {
    zh: '读取当前行前后最多 40 行同步歌词。',
    en: 'Read up to 40 synced lyric lines around the current position.',
  },
  spotify_cue_script: {
    zh: '取一段可直接交给 pet_say 的脚本：歌词加已选好的表情与动作。',
    en: 'Get a ready pet_say script with the lyric and chosen actions.',
  },
  spotify_set_singing: {
    zh: '按用户要求开启或关闭歌词跟唱，并保存到配置。',
    en: 'Turn lyric singing on or off and persist the setting.',
  },
} as const;

const definition: WorldDefinition<SpotifyConfig> = {
  id: 'spotify-lyrics',
  label: 'Spotify 跟唱',
  defaults,
  preflight(ctx) {
    if (process.platform !== 'darwin') {
      throw new Error('此版本只在 macOS 上工作：它通过 AppleScript 读取 Spotify。');
    }
    if (normalize(ctx.cfg).cueMode === 'listen') ctx.persist({ cueMode: 'sing' });
  },
  create: (ctx) => new SpotifyLyricsWorld(ctx.cfg, (patch) => ctx.persist(patch), {
    dataDir: join(ctx.dataDir, 'spotify-lyrics'),
    configFile: join(ctx.dataDir, '..', 'config.json'),
    roots: searchRoots(),
  }),
  describe: {
    tools: describeTools(toolDecls, summaries),
    events,
  },
};

export default definition;
