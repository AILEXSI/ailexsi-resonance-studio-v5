# V5 Evidence

Stand: 2026-08-30 04:05 UTC. Sequential-import follow-up on PR #1. Commands below are from this follow-up run unless noted.
Repo: https://github.com/AILEXSI/ailexsi-resonance-studio-v5 (private, origin present). Branch `cursor/visualz-scenes-7f5e` / PR #1.
V4 was not copied. No files taken from ailexsi-resonance-studio.
COMPLETE: NO

Allowed statuses: IMPLEMENTED | RUNTIME-VERIFIED | TEST-VERIFIED | NOT VERIFIED | PLANNED | NOT IMPLEMENTED

## Browser host

Status: RUNTIME-VERIFIED

Vite was already listening from an earlier session on this VM.

```
curl -sS -D - -o /tmp/v5-index.html http://127.0.0.1:1421
```

Observed: HTTP/1.1 200 OK, Content-Type text/html, Content-Length 585, body contains `id="root"`.
`vite.config.ts` binds `host: "127.0.0.1"`, `port: 1421`, `strictPort: true`. Not 0.0.0.0.

## Build

Status: RUNTIME-VERIFIED

```
npx tsc --noEmit
```

exit 0

```
npx vite build
```

exit 0. vite 7.3.6, 134 modules. Outputs:
- dist/index.html 0.41 kB
- dist/assets/index-BqKW0e4x.css 8.00 kB
- dist/assets/index-Dj5DKiIV.js 628.21 kB (this follow-up `npx vite build`, exit 0, 134 modules)
Rollup warned the JS chunk is >500 kB. That is a size warning, not a failed build.

## Automated tests

Status: TEST-VERIFIED

```
npx tsc --noEmit
```

exit 0 (this follow-up).

```
npx vitest run
```

exit 0. vitest 3.2.7. **77 passed / 8 files**. Start 04:05:52 UTC. Duration 1.39s.

Files: import 11, visualizer 17, user-fixtures 2, persistence 6, timeline 18, export 12, foundation 8, preview 3.

## Visualizer

Status: TEST-VERIFIED

Six Canvas-2D scenes vendored from https://github.com/AILEXSI/ailexsi-visualz @ b67410c (`@ailexsi/visualz` 0.1.0-blueprint). Not V4. Not MilkDrop/Butterchurn. No live npm dep.

Ids: pulse-orb, spectrum-bars, particle-field, resonance-wave (default), tunnel-spiral, lita-bloom.
VIS is not a TrackId (`isTrackId("VIS") === false`, unit).

Unit (this run):
- all 6 ids accepted; `nextSceneId` cycles without repeats until wrap
- software pixel canvas: each scene paints >20 non-empty pixels; six fingerprints differ
- `featuresAt` is a synthetic 120 BPM `AudioFeatures` grid (not file FFT)
- Preview code can tap A1/A2 AnalyserNode; that live path was not measured this run

VIS-in-export: `paintVisualizer` calls `featuresAt`. SYNTHETIC FALLBACK. Never a real FFT during encode.

UI click-cycle this run: see UI chrome (VIS button only).

## Import

Status: TEST-VERIFIED (sequential place). Multi-file picker UI: NOT VERIFIED.

`importFiles` now places each new clip at `lastClipEndMsOnTrack` for the matching track (V1 or A1 unless the session target is already V2/A2). Same-kind files in one import sit end-to-end. Mixed picker: videos sequential on video track(s), audio sequential on audio track(s). Existing clips are not moved; new clips append after the last end on that track. Empty track → start 0. Media-browser Place-at-playhead is unchanged.

`tests/media/import.test.ts` (11):
- text/png throw `ImportError` WRONG_TYPE
- wav → audio, mp4 → video
- place video on V1 and V2, audio on A1 and A2
- video on A1 rejected
- two videos sequential on V1 (0 then 1000)
- two audios sequential on A1
- mixed video+audio independent tracks
- append after an existing V1 clip (start 200 dur 800 → new at 1000; old start unchanged)
- single file on empty A1 starts at 0

No live multi-file picker this follow-up.

## Timeline

Status: TEST-VERIFIED

Existing units still green (18): move/clamp, kind reject, V1→V2, split + 50ms edge guard, snap, undo/redo, IN>OUT, trim in/out/source bounds, mute, loop IN/OUT/moveInOut.
No timeline defects found this pass. No new timeline tests except VIS-is-not-TrackId in foundation.
UI drag: NOT VERIFIED this run.

## Preview / playback

Status: TEST-VERIFIED

`tests/preview/playback.test.ts` (3): sourceTimeAt, loop IN/OUT stop, bounds from clip extent.
No video frame seen and no audio heard this run.

## Persistence

Status: TEST-VERIFIED

Memory store hydrate + serialize strip blob URLs: pass.
Visualizer field round-trips; missing `visualizer` deserializes to `{ enabled: true, muted: false, sceneId: "resonance-wave" }`.
`createIndexedDbBlobStore` exercised with an in-process IDB shim (`tests/helpers/fake-indexeddb.ts`). That is not a browser IndexedDB and not a page reload.

IndexedDB page-reload: NOT VERIFIED (no browser reload this run).

## Inspector

Status: IMPLEMENTED

Fields exist in `src/ui/inspector/Inspector.tsx`. Not clicked this run.

## Export

Status: TEST-VERIFIED (fail planner + ftyp). Successful H.264 encode: NOT VERIFIED this run.

This environment has no `VideoEncoder`. `exportTimeline` returns FAIL WebCodecs / WebM is not a fallback (unit).

Also unit-green:
- empty project / empty job FAIL
- IN >= OUT throws
- missing-only video FAIL `missing:user-video.mp4`
- WebM bytes rejected as MP4
- synthetic mux has ftyp `isom`/`avc1` (not a runtime user export)
- job copies visualizer scene; encode features stay synthetic 120 BPM

audio export: NOT IMPLEMENTED. AAC mixer/encoder functions exist in `src/core/exporter/audio.ts` but this run did not mux AAC and did not produce an MP4 with an audio track. Do not treat that code as proven.

No `artifacts/v5-user-export.mp4` in this workspace this run.

## Start-V5.cmd

Status: IMPLEMENTED (files). Windows double-click: NOT VERIFIED.

`Start-V5.cmd` and `scripts/start-v5.ps1` exist at repo root / scripts. This Linux VM did not execute the `.cmd`.

## Security / boundary

Status: TEST-VERIFIED (static + config)

- Vite host 127.0.0.1 only
- no CORS wildcard in src
- no secrets in tree
- no installer download in Start-V5 (German error + pause if node/npm missing)
- `isPlayableSource` blocks javascript:/data:/vbscript:; export fetch is for clip `sourceUrl` (blob/file/http)
- product code has no child_process / eval
- Start-V5.cmd may call local npm/node (allowed)

## UI chrome

Status: IMPLEMENTED. Full Import→Edit→Preview→Persist→Export click-path: NOT VERIFIED.

VIS scene button this run: RUNTIME-VERIFIED (pointer). Opened http://127.0.0.1:1421, clicked the VIS lane scene control through Wave / Tunnel / Bloom / Orb / Bars / Field and wrap. Preview canvas stayed up; status showed `Visualizer <id>`. No import and no export in that pass.

## Adversarial (unit, this run)

empty export FAIL; bad type ImportError; split near edge reject; move past 0 clamp; undo/redo; IN>OUT reject; missing-only video FAIL; WebM not MP4.

## Deps

`npm ci` earlier this session. Product scripts: dev, build, test, fixtures. mediabunny ^1.55.3 for frame decode. No unpublished Visualz npm dep.

## Known limitations (plain)

- Audio export NOT IMPLEMENTED (no AAC track proven).
- IndexedDB across a real page reload NOT VERIFIED.
- Start-V5.cmd Windows double-click NOT VERIFIED.
- Full Import→Edit→Preview→Persist→Export click-path NOT VERIFIED. VIS scene cycle was pointer-tested this run.
- VIS encode uses SYNTHETIC 120 BPM features, not live FFT.
- Successful user-clip H.264 MP4 encode NOT VERIFIED this run (no VideoEncoder here).
- src-tauri leftover unused.

## Changelog this follow-up (2026-08-30 04:05 UTC)

- Sequential multi-file Import: end-to-end on matching track. TEST-VERIFIED (5 cases).
- Multi-file picker UI: NOT VERIFIED.

## Commits on this branch (tip)

See git log after sequential-import commits. Prior tip included:

```
b824fc6 docs(v5): rewrite V5-EVIDENCE from this verification run
d552d82 test(v5): paint VIS pixels and close persist/import holes
51d93dc feat(v5): Windows Start-V5.cmd app launcher
```

## Not added

chat, Ollama, vault, AI Arrangement, Beats, AI_EVENTS, VIS TrackId, MilkDrop, Butterchurn, ffmpeg.wasm, MediaRecorder-as-MP4, unpublished deps, V4 file copies, publish, sale.
