# V5 Evidence
Stand: 2026-08-28 18:23 PT (Europe/Berlin). Commands below actually ran.

Repo: local /workspace/ailexsi-resonance-studio-v5 (no remote; not pushed).
V4 was not copied. src-tauri leftover unused.

Levels used: PLANNED | IMPLEMENTED | CODE-VERIFIED | RUNTIME-VERIFIED | ACCEPTANCE-VERIFIED

## Browser host
Status: RUNTIME-VERIFIED
npx vite --host 127.0.0.1 --port 1421 --strictPort (running)
curl http://127.0.0.1:1421/ => HTTP 200, HTML mounts #root. Host is 127.0.0.1, not IPv6-only.

## Build
Status: RUNTIME-VERIFIED
npx tsc --noEmit => exit 0
npx vite build => exit 0 (47 modules). package.json script build maps to vite build.

## Automated tests
Status: RUNTIME-VERIFIED
npx vitest run => exit 0, 30 passed / 6 files (foundation media timeline persistence preview export)

## Import
Status: CODE-VERIFIED
tests/media/import.test.ts: wrong type throws ImportError; import then place clip. No live UI picker in this run.

## Timeline
Status: CODE-VERIFIED
Unit: split, 50ms edge guard, move clamp past 0, kind mismatch reject, snap, undo/redo, IN>OUT reject.
UI drag not pointer-tested by a human.

## Preview
Status: CODE-VERIFIED
tests/preview/playback.test.ts: source time, loop IN/OUT, stop. No frame seen / no audio heard.

## Persistence
Status: CODE-VERIFIED
Serialize strips blob URLs; hydrate from memory store; missing flagged. IndexedDB implemented; no real browser reload in this run.

## Inspector
Status: IMPLEMENTED
Fields: track, start, duration, sourceIn, sourceOut, gain. Blend/speed labeled not-implemented. Not clicked in a UI session.

## Export
Status: ACCEPTANCE-VERIFIED (WebCodecs H.264 MP4 slate encode)
Node: exportTimeline FAIL path without VideoEncoder. Planner rejects empty and IN>=OUT. ftyp validator rejects WebM.
Chrome headless loaded http://127.0.0.1:1421/export-check.html and ran exportTimeline + VideoEncoder.
Wrote /workspace/ailexsi-resonance-studio-v5/artifacts/v5-check.mp4
size=2279 bytes
hex header: 00 00 00 20 66 74 79 70 69 73 6f 6d 00 00 02 00
brands: isom iso2 avc1 mp41. Source clip was missing; encoder drew a slate. Still ftyp MP4, not WebM.

## Adversarial (unit)
empty project export: FAIL. bad file type: ImportError. split near edge: reject. move past 0: clamp. undo/redo: pass. IN>OUT: reject.

## Deps
package install => exit 0. Product scripts: dev, build, test. Tauri CLI dropped from product deps.

## Known issues
- MP4 has no AAC audio mix (preview still plays A1/A2).
- Missing media exports a slate, not original frames.
- IndexedDB hydrate not proven across a real page reload.
- src-tauri leftover unused.

## Commits this session
2346cfc feat(v5): add browser core, persistence, and WebCodecs exporter
62b81f1 feat(v5): compose browser NLE ui
b51bad4 test(v5): add vitest suites and tiny fixtures
