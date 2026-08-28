# V5 Evidence
Stand: 2026-08-28 19:01 PT (Europe/Berlin). Commands below actually ran.

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
npx vitest run => exit 0, 53 passed / 8 files (43 prior + 10 visualizer)

## Visualizer
Status: CODE-VERIFIED
Contract ported in V5 code (not a V4 file copy). Two scenes only: spectrum-bars, pulse-orb.
Project.visualizer defaults enabled true, muted false, sceneId spectrum-bars.
TRACK_IDS unchanged: V1 V2 A1 A2. VIS is not a TrackId and is not a clip drop target.
Core: src/core/visualizer.ts beatGrid, energyAt, featuresAt (120 BPM grid, not file FFT), renderVisualizerScene, nextSceneId, shouldShowVisualizer.
Timeline: VIS lane above V1 with mute and scene cycle (Bars / Orb).
Preview: no unmuted V1/V2 under playhead and enabled and not muted -> canvas visualizer-canvas. User video wins.
Old projects missing visualizer deserialize to the default (unit).
Not human-clicked. Canvas pixels not seen. Not in the exporter. Not ACCEPTANCE-VERIFIED.
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
Status: ACCEPTANCE-VERIFIED (WebCodecs H.264 MP4 slate encode; NOT real-frame user-video)
Node: exportTimeline FAIL path without VideoEncoder. Planner rejects empty and IN>=OUT. Muted tracks omitted from the job (unit). ftyp validator rejects WebM.
Chrome headless loaded http://127.0.0.1:1421/export-check.html and ran exportTimeline + VideoEncoder.
Wrote /workspace/ailexsi-resonance-studio-v5/artifacts/v5-check.mp4
size=2279 bytes
hex header: 00 00 00 20 66 74 79 70 69 73 6f 6d 00 00 02 00
brands: isom iso2 avc1 mp41. Source clip was missing; encoder drew a slate. Still ftyp MP4, not WebM.
Visualizer is preview-only this pass; export does not draw VIS scenes.

## Adversarial (unit)
empty project export: FAIL. bad file type: ImportError. split near edge: reject. move past 0: clamp. undo/redo: pass. IN>OUT: reject.

## Deps
package install => exit 0. Product scripts: dev, build, test. Zero new packages this pass. Tauri CLI dropped from product deps.

## Known issues
- MP4 has no AAC audio mix (preview still plays A1/A2).
- Missing media exports a slate, not original frames.
- Real-frame export of user-video.mp4 not run this pass.
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

## Not added
chat, Ollama, vault, AI Arrangement, Beats, AI_EVENTS, VIS TrackId, a second loop, V4 file copies, publish.
