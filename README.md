# Spotify 跟唱 · cortico-world-spotify-lyrics

在 macOS 上读取 Spotify 的当前曲目与播放位置，把正在唱的那一句歌词交给桌宠念出来，并配一个表情和跳舞动作。

- 播放状态：常驻 JXA（`osascript -l JavaScript`）子进程，200 ms 采样。一次性 `osascript` 每次约 210 ms，常驻后每行 1–15 ms。
- 歌词：LRCLIB 同步歌词，本地 `lrc/<trackId>.lrc` 优先，结果缓存 30 天；限流或 5xx 会退避重试，失败后 6/12/24 秒再试，取到之前不退回纯动作。
- 动作：从当前形象的 `figure.json` 读词表，按句子强度和位置选表情与动作，只发 `dance`/`flap`/`spin`/`nod` 这类已有动作；听歌时不用打盹和睡觉。
- 说话由桌宠的 `pet_say` 完成：事件正文里直接给出完整脚本，模型原样搬运，不自己造句、不做二次解析。

## 前置

- macOS 13 及以上，安装 Spotify 桌面版（网页版没有播放位置）。
- Coopanion 已安装并运行，桌宠 World 处于启用状态。
- 首次读取时系统会询问「Coopanion 想要控制 Spotify」。拒绝过就在 系统设置 › 隐私与安全性 › 自动化 里补开。

## 安装

```bash
# 本机联调：在 Coopanion 的扩展目录里链接本包
cd ~/Library/Application\ Support/Coopanion/extensions
pnpm add "/Volumes/SSD/Personal Project/Coopanion-spotify-lyrics/src"
```

重启 Coopanion，在 World 概览里启用「Spotify 跟唱」。扩展安装与卸载都需要重启进程才生效。

## 配置

World 页的「设置」里有两组：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `cueMode` | `sing` | `off` 停止推送 |
| `continuousDance` | 开 | 播放期间把舞蹈接上，只在切歌间隙停 |
| `batchLines` | 3 | 一次下发几句歌词 |
| `batchSeconds` | 12 | 一次最多盖住多少秒歌词 |
| `leadSeconds` | 0.2 | 提前量，抵消模型延迟；歌词总慢半拍就调大 |
| `maxChars` | 40 | 单行气泡字数，超出按标点截断 |
| `showLyricText` | 开 | 关掉后只做动作 |
| `intensity` | `auto` | `soft` / `normal` / `hype` 强制动作强度 |
| `lyricsSource` | `auto` | `local` 只用本地 lrc，`off` 不取歌词 |
| `quietHours` | 关 | 时段内不推送 |

`pollMs` 改动需要重启 World。

## 数据

`<dataDir>/spotify-lyrics/`：

- `lyrics/<trackId>.json` 歌词缓存，可在 World 页的数据页签清除。
- `lrc/<trackId>.lrc` 自备同步歌词，优先于任何在线来源，不会被清除。

## 边界

- 插件不能直接驱动桌宠窗口：桌宠没有对外的动作接口，所以动作经模型调用 `pet_say` 落地，句级同步，延迟 1–3 秒，做不到逐拍。
- 气泡在桌宠里是队列，一句至少显示 2–6 秒（取决于桌宠的「气泡语速」），所以干脆按批下发：一次 3 句，桌宠连着念完。
- 只读播放器，不读音频，不采集账号信息。
- 歌词是作品文本，气泡每次只显示当前一句。

## 开发

```bash
npm install
npm test
npm run typecheck
```
