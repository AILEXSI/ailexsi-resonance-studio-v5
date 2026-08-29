# V5 Evidence
Stand: 2026-08-29 19:18 PT (Europe/Berlin). Commands below actually ran.

Repo: local ailexsi-resonance-studio-v5 (no remote; not pushed; not published).
V4 was not copied. No files taken from ailexsi-resonance-studio or suite-v4.2. src-tauri leftover unused.
COMPLETE: NO

Levels used: PLANNED | IMPLEMENTED | CODE-VERIFIED | RUNTIME-VERIFIED | ACCEPTANCE-VERIFIED

## Browser host
Status: RUNTIME-VERIFIED
npx vite --host 127.0.0.1 --port 1421 --strictPort (running)
curl => HTTP 200, 585 bytes, text/html, mounts #root. Host is loopback, not IPv6-only.

## Build
Status: RUNTIME-VERIFIED
npx tsc --noEmit => exit 0
npx vite build => exit 0 (50 modules). package.json script build maps to vite build.

## Automated tests
Status: RUNTIME-VERIFIED
npx vitest run => exit 0, 56 passed / 8 files

## Visualizer
Status: CODE-VERIFIED
Contract ported in V5 code (not a V4 file copy). Two scenes only: spectrum-bars, pulse-orb.
Project.visualizer defaults enabled true, muted false, sceneId spectrum-bars.
TRACK_IDS unchanged: V1 V2 A1 A2. VIS is not a TrackId and is not a clip drop target.
Core: src/core/visualizer.ts beatGrid, energyAt, featuresAt (120 BPM grid, not file FFT), renderVisualizerScene, nextSceneId, shouldShowVisualizer.
Timeline: VIS lane above V1 with mute and scene cycle (Bars / Orb).
Preview: no unmuted V1/V2 under playhead and enabled and not muted -> canvas visualizer-canvas. User video wins.
Old projects missing visualizer deserialize to the default (unit).
Not human-clicked. Canvas pixels not seen. Export draws user frames when source decodes; VIS scenes still preview-only.
COMPLETE: NO

## Import
Status: CODE-VERIFIED
tests/media/import.test.ts: wrong type throws ImportError; import then place clip. No live UI picker in this run.

## Timeline
Status: CODE-VERIFIED
Unit: split, trim in and out, 50ms guard, source range rejects, move clamp, snap, undo/redo, IN>OUT reject, mute toggle.
UI drag not pointer-tested by a human.

## Preview
Status: CODE-VERIFIED
tests/preview/playback.test.ts: source time, loop IN/OUT, stop. No frame seen / no audio heard.
Visualizer fallback is CODE-VERIFIED only (see Visualizer).

## Persistence
Status: CODE-VERIFIED
Serialize strips blob URLs; hydrate from memory store; missing flagged. IndexedDB implemented; no real browser reload in this run.
visualizer field serializes; missing visualizer on load goes to default.

## Inspector
Status: IMPLEMENTED
Fields: track, start, duration, sourceIn, sourceOut, gain. Time fields also show mm:ss.cc. Blend and Speed rows removed. Not clicked in a UI session.

## Export
Status: ACCEPTANCE-VERIFIED (user-clip H.264 MP4 frames; AAC audio track NOT present)
Node: exportTimeline FAIL path without VideoEncoder. Planner rejects empty and IN>=OUT. Muted tracks omitted from the job (unit). ftyp validator rejects WebM. Missing-only video => FAIL missing:user-video.mp4.
Chrome headless dump-dom loaded /export-check.html, imported user-video.mp4 + user-audio.mp3, placed V1+A1, OUT=5000, exportTimeline.
Wrote artifacts/v5-user-export.mp4
size=1806778 bytes (>> 2279 slate)
hex header: 00 00 00 20 66 74 79 70 69 73 6f 6d 00 00 02 00
brands: isom iso2 avc1 mp41. audio=none hasAudioTrack=false. SHA-256 db8201818fdac91dbdc5e9b4999293a373e43e7e90183567f45e2b0456c4da89. t=1s frame matches user-video, not a slate.
Mediabunny decoder true for user-video.mp4. ffprobe: 5.00s H.264 Constrained Baseline 1280x720 30fps 2890 kb/s. No AAC track.

## Adversarial (unit)
empty project export: FAIL. bad file type: ImportError. split near edge: reject. move past 0: clamp. undo/redo: pass. IN>OUT: reject. missing-only video: FAIL missing:user-video.mp4.

## Deps
package install => exit 0. Product scripts: dev, build, test. mediabunny ^1.55.3 added for frame decode. Tauri CLI dropped from product deps.

## Known issues
- MP4 has no AAC audio mix this run (audio=none). Preview still plays A1/A2.
- Visualizer not in export; only two scenes; 120 BPM grid only.
- No GitHub remote, no publish, no sell claim.
- UI chrome not human-clicked (IMPLEMENTED only).
- IndexedDB hydrate not proven across a real page reload.
- src-tauri leftover unused.

## UI chrome
Status: IMPLEMENTED
Toolbar File | Edit | brand 5.0.0. Transport has Clear. Question-mark shortcuts overlay. 52px lanes plus VIS lane. Status shows asset name. Not ACCEPTANCE-VERIFIED.

## Commits this session
2346cfc feat(v5): add browser core, persistence, and WebCodecs exporter
62b81f1 feat(v5): compose browser NLE ui
b51bad4 test(v5): add vitest suites and tiny fixtures
ace8304 feat(v5): add clip edge trim and track mute
27722a9 test(v5): trim and mute cases
572abcc feat(v5): studio chrome and shortcuts overlay
ebf63cf feat(v5): add visualizer lane fallback canvas
60f36d1 test(v5): visualizer energy and fallback rules
0138ed9 feat(v5): decode user frames and mix audio into mp4
9c2a771 test(v5): export fails on missing source

## Not added
chat, Ollama, vault, AI Arrangement, Beats, AI_EVENTS, VIS TrackId, a second loop, V4 file copies, publish.
