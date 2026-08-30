# V5 Evidence

Stand: 2026-08-30 06:27 UTC. Ripple trim + roll + lane-header solo on PR #1. Commands below are from this follow-up run unless noted.
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

exit 0. vite 7.3.6, 150 modules. Outputs:
- dist/index.html 0.41 kB
- dist/assets/index-CtDAR3fN.css 16.46 kB
- dist/assets/index-BGSApQ1F.js 673.53 kB
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

exit 0. vitest 3.2.7. **183 passed / 30 files**. Start 06:27:24 UTC. Duration 5.67s.

New this follow-up: ripple-trim (out to 800 pulls later A1; lift-trim does not); roll +200 with undo; 50ms guards; lane-header S on V1–A2; `liftTrim` / `rippleTrim` / `rollEdit` on `applyCommand`. Prior suites remain green.

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

Status: TEST-VERIFIED (edit units + zoom-fit). UI drag / Fit click: NOT VERIFIED.

Existing units still green (24): move/clamp, kind reject, V1→V2, split + 50ms edge guard, snap, undo/redo, IN>OUT, trim in/out/source bounds, mute, loop IN/OUT/moveInOut, ripple-delete same-track shift, solo toggle, ripple-trim vs lift-trim, roll +200 / 50ms reject.

Zoom (`tests/timeline/zoom.test.ts`):
- ~300s clip fitted into a 1000px lane → zoom < 10 px/s and clip width ≤ usable lane
- zoom-out from 10 still decreases
- Fit does not clamp at 10; scrollMs=0
- from Fit (scrollMs=0) with playhead at 27s, zoom-in keeps the playhead in view
- further zoom-in (80 → 160 px/s) still keeps it
- Fit after that still shows the full duration at scroll 0
- off-screen playhead is scrolled into view on zoom-in
- zoom-out that is not Fit keeps the playhead on screen
- clamp max is 48000; 401 is not snapped to 400; `+` from 400 goes to 480
- Fit from 12000 px/s still lands on the low end, scrollMs=0
- playhead-lock holds at 2000 and 12000 px/s
- serialize/deserialize keeps 12000; 50000 loads as 48000

Non-Fit zoom is DAW-style around the playhead (same screen-x). Fit stays left-anchored (scrollMs=0). Live `+` past 400: NOT VERIFIED this run.

## Ruler

Status: TEST-VERIFIED (label gaps). Live Fit ruler pixels: NOT VERIFIED.

`buildRulerTicks` at 2.5 px/s over 400s: consecutive major labels have a minimum pixel gap (no overlap). Zoom-in to 80 px/s uses a smaller step (higher density) without overlap. 400 / 2000 / 12000 px/s stay non-overlapping; high zoom steps down through frames to milliseconds. Fit + playhead-lock units still green.

## Arrange clip previews

Status: TEST-VERIFIED (min/max envelope + stubbed filmstrip). Live waveform/filmstrip pixels: NOT VERIFIED.

Audio: `envelopeForWidth` returns ~1 min/max pair per CSS pixel; zoom-in on the same source window increases peak count. `envelopeToPath` is a filled +peak/−peak silhouette with adjacent x (no bar gaps). Empty/not-ready samples return no path so the green clip fill stays. Mipmap is built once after `decodeAudio`; paints resample the pyramid. Live clip pixels: NOT VERIFIED.

Video: `filmstripTimes` / `collectFilmstripTimes` request N thumbs along source-in…source-out via a stubbed decoder. DOM paints stub `<img>`s. Live video-element thumbs: NOT VERIFIED.

Import is not blocked. Empty fill stays until samples/thumbs arrive. No V4, no ffmpeg.wasm, no Butterchurn.

## Keys / clip menu

Status: TEST-VERIFIED (labels + dispatch). Menu open in a live UI: NOT VERIFIED.

Split is **S**, not V. Paste is Ctrl+V. Cut is Ctrl+X. Copy is Ctrl+C (non-destructive). Bare X still clears IN/OUT. Letter shortcuts ignore ctrl/meta except the explicit chords.

`tests/app/keys.test.ts` (10): prior 7 plus Shift+Delete ripple (Delete still lifts); J/K/L shuttle rates; comma/period nudge (±1 / Shift ±10) while arrows still step the playhead.

`tests/timeline/clip-menu.test.tsx` (3): clip-menu DOM contains S, Ctrl+X, Ctrl+C, Ctrl+V, Delete, Ripple delete / Shift+Delete; overlay lists J/K/L, comma/period, Lane / Mixer S, Shift+edge-drag ripple trim, abutting edge-drag roll; toolbar + transport Split show S.

`?` overlay opened this run: RUNTIME-VERIFIED (labels visible). Live ripple/nudge/JKL on clips: NOT VERIFIED.

## Preview / playback

Status: TEST-VERIFIED

`tests/preview/playback.test.ts` (5): sourceTimeAt, loop IN/OUT stop, bounds from clip extent, reverse shuttle stop/wrap, 1→2→4 rate table.
Live JKL shuttle in a browser: NOT VERIFIED (not required this VM).
No video frame seen and no audio heard this run.

## Project file Save / Open

Status: TEST-VERIFIED (store + panel). Live pickers clicked this run: RUNTIME-VERIFIED (dialogs opened, then cancelled — no file written).

Compact **Projekt** overlay (not a permanent left rail): closed by default. Toolbar Save / Open / Zuletzt geladen open it. Esc, outside click, or a successful FSA save/open close it. MEDIA lives inside the overlay. Import stays on the toolbar. Preview reclaims the left width when the panel is closed.

Panel still shows last file name, folder remembered (`directoryHandle.name` or `filename — Ordner gemerkt`), recents, Speichern / Speichern unter / Öffnen / Ordner wählen. The panel never invents a `C:\` path; the OS dialog still shows the real filesystem path.

Status this slice: TEST-VERIFIED (overlay open/close). Live overlay click this run: NOT VERIFIED.

Chrome File System Access: first picker `startIn: documents`. After save/open, the directory (or file) handle plus last-N recents are stored in IndexedDB and passed as `startIn` next time. `showDirectoryPicker` sets an explicit default folder.

Live this run (Chromium on this VM, http://127.0.0.1:1421):
- Speichern unter → native save dialog (`Untitled_Resonance.resonance.json`) → Escape
- Öffnen → native “Select a file this site can read” → Escape
- Ordner wählen → native directory picker → Escape
Folder was not persisted this run because the dialogs were cancelled. Recents stay empty until a completed save/open.

`tests/persistence/project-file.test.ts` (9): startIn, recents file+dir handle round-trip, panel view names, Speichern unter/Öffnen startIn last dir, Ordner wählen, recent reopen. No fake Windows path asserts. Panel DOM: `tests/persistence/project-file-panel.test.tsx`.

## Markers

Status: TEST-VERIFIED (move/delete + JSON). Live ruler drag: NOT VERIFIED.

Place (M / Marker button) already existed. This pass: drag a flag along the ruler updates `markers[].timeMs` in the session/project JSON. Select a marker and Delete/Backspace removes **that** marker only. A selected clip still wins Delete (clip is removed, markers stay). Per-marker × and a small context menu also delete one id. Clearing all is not the only path.

## Mixer

Status: RUNTIME-VERIFIED (visible next to timeline + A1 fader drag). Collapse: TEST-VERIFIED. Live collapse click this run: NOT VERIFIED.

Right of the arrange/timeline (`.arrange-row`: timeline | 228px mixer). Collapse control is top-left of the mixer pane. Collapsed = **MST only** (V1–A2 unmounted, not deleted). Expanded = V1 V2 A1 A2 + MST. Persist `resonance-studio-v5-mixer-collapsed`. Vertical fader, dB label, peak meter. Mute stays a separate switch. Clip Gain in the inspector is unchanged.

Layout CSS: mixer `min-width`/`width` 228px, not `display:none`. Arrange row has a reserved height so the strip cannot collapse to width 0. Live: mixer sat beside the timeline; A1 fader dragged from 0.00 dB to about -7.31 dB; status showed the A1 dB.

Curve: linear = 10^(dB/20). 0 dB = 1. -6 dB ≈ 0.501. Bottom / -∞ = 0. Track `volume` and `masterVolume` persist in `.resonance.json`. Preview applies track+master via GainNodes when Web Audio is up; export bakes the mix into clip gain. VIS is not a mixer channel.

`tests/mixer/volume.test.ts` (6): unity / -6 dB / silence; peakToDb; mute zeros mix; session JSON round-trip; legacy missing volume → 1; solo persist + legacy missing solo → false.

Mixer S sits next to M on V1–A2 only (not Master). TEST-VERIFIED (DOM). Chrome S buttons seen this run: RUNTIME-VERIFIED (empty project, no click). Live S click / audible mix: NOT VERIFIED.

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

Status: TEST-VERIFIED (fail planner + ftyp + cancel dialog). Successful H.264 encode: NOT VERIFIED this run. Live cancel: NOT VERIFIED.

Export opens an in-app dialog (not a native OS window) with file name, 1280×720 / fps, percent + stage, and **Abbrechen**. Close/X while running is cancel. Abort uses `AbortController` (`hooks.signal`); result is `aborted: true`, `success: false`, no blob, no `downloadMp4`. No File System Access handle is created until a successful download click — cancel therefore leaves no partial success file. Preview/arrange stay interactive (`pointer-events: none` on the layer).

This environment has no `VideoEncoder`. `exportTimeline` returns FAIL WebCodecs / WebM is not a fallback (unit), or `aborted` if the signal is already aborted.

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

## Layout (preview / arrange)

Status: TEST-VERIFIED (units + DOM + cursor). Live ns-resize drag this run: NOT VERIFIED.

The seam is `.layout-split` between VIDEO/PREVIEW (above, includes `Active: V1…`) and lower-stage transport/arrange (below). Hover/drag cursor is **ns-resize**. Mouse down + drag changes preview vs arrange heights (one split, two panes). Mins: preview 120px, arrange 160px. Ratio persisted (`resonance-studio-v5-preview-split`). This is not a mixer-width drag; mixer stays right of arrange.

Horizontal ew-resize splitter between PREVIEW and INSPECTOR; ratio persisted (`resonance-studio-v5-preview-h-split`). Mins: preview 200px, inspector 180px.

`.arrange-row` has `overflow-y: auto`. Track row heights are not shrunk to fit. When preview is tall, A2 remains in the DOM and the arrange pane can scroll. Transport/zoom stay above the scrollport.

## UI chrome

Status: IMPLEMENTED. Full Import→Edit→Preview→Persist→Export click-path: NOT VERIFIED.

Default chrome: no left PROJEKT rail. Mixer still right of arrange. Overlay / h-split / arrange-scroll live clicks this run: NOT VERIFIED.

Earlier (05:00): Speichern unter / Öffnen / Ordner wählen opened native File System Access dialogs (cancelled). A1 fader dragged ~0 dB → about -7.31 dB.

VIS scene button earlier: RUNTIME-VERIFIED (pointer). Opened http://127.0.0.1:1421, clicked the VIS lane scene control through Wave / Tunnel / Bloom / Orb / Bars / Field and wrap. Preview canvas stayed up; status showed `Visualizer <id>`. No import and no export in that pass.

MEDIA display names are shortened in the bin (tooltip keeps the real filename). Files on disk are not renamed.

## Adversarial (unit, this run)

empty export FAIL; bad type ImportError; split near edge reject; move past 0 clamp; undo/redo; IN>OUT reject; missing-only video FAIL; WebM not MP4.

## Deps

`npm ci` earlier this session. Product scripts: dev, build, test, fixtures. mediabunny ^1.55.3 for frame decode. No unpublished Visualz npm dep.

## Known limitations (plain)

- Audio export NOT IMPLEMENTED (no AAC track proven).
- IndexedDB across a real page reload NOT VERIFIED.
- Start-V5.cmd Windows double-click NOT VERIFIED.
- Full Import→Edit→Preview→Persist→Export click-path NOT VERIFIED. VIS scene cycle and earlier Projekt/mixer clicks were pointer-tested. Overlay / h-split / arrange-scroll live this run: NOT VERIFIED. Recents after a completed save: NOT VERIFIED.
- VIS encode uses SYNTHETIC 120 BPM features, not live FFT.
- Successful user-clip H.264 MP4 encode NOT VERIFIED this run (no VideoEncoder here).
- src-tauri leftover unused.

## Command dispatch

Status: TEST-VERIFIED

`src/app/commands.ts` `applyCommand(session, command)` is the named mutation entry. `EditorCommand` covers existing key/toolbar edits plus ripple, nudge, shuttle, mute, solo. `dispatchEditorKey` and App keyboard/toolbar/transport/mixer go through it. Timeline math stays in `src/core/timeline.ts`. Same session+command → same clips/tracks/shuttleRate (`tests/app/commands.test.ts`). Not an AI feature. Live toolbar-through-command click: NOT VERIFIED.

## Ripple delete

Status: TEST-VERIFIED

Delete/Backspace stay lift (gap remains). Shift+Delete / Shift+Backspace remove the selected clip and shift later clips on the **same** track left by that clip's duration. Other tracks unchanged. Undo restores. Clip menu: Ripple delete / Shift+Delete. Live menu click: NOT VERIFIED.

## Solo

Status: TEST-VERIFIED (rule + persist + mixer DOM). Live S click / audible mix: NOT VERIFIED.

`Track.solo` defaults false; legacy JSON missing solo → false. If any track is soloed, only soloed tracks are audible; mute still wins on a soloed track. `isTrackAudible` is shared by preview (`topVideoClipAt` / `audioClipsAt` / mix gain) and export `jobFromProject`. Mixer S next to M on V1–A2, not Master.

## JKL shuttle

Status: TEST-VERIFIED (keys + rate table + reverse `advancePlayhead`). Live shuttle: NOT VERIFIED.

Session `shuttleRate` (0 = paused). J reverse, K pause/rate 0, L forward. Repeat L/J: 1× → 2× → 4×, cap 4. Space is play/pause at 1× (pauses any shuttle, then plays +1). rAF advances `delta * rate`. Reverse stops at IN without loop and wraps with loop.

## Nudge

Status: TEST-VERIFIED

`,` / `.` move the selected clip ±1 `FRAME_MS`. Shift+, / Shift+. = 10 frames. Start clamps at 0. Track/kind is unchanged (kind-change still rejected by `moveClip`). ArrowLeft/Right still step the playhead.

## Ripple trim

Status: TEST-VERIFIED. Live Shift+edge-drag: NOT VERIFIED.

Normal edge-drag stays lift trim (`trimClip`). Shift+edge-drag is `rippleTrim` via `applyCommand`: after the trim, later clips on the same track (start ≥ original end) shift by the duration delta. Other tracks unchanged. 50ms edge guard still applies. Undo restores the trimmed clip and shifted neighbors.

## Roll edit

Status: TEST-VERIFIED. Live abutting-edge drag: NOT VERIFIED.

When two clips on the same track abut (end of A == start of B within 1ms), edge-drag rolls: A's out and B's in move together, cut time changes, A+B span stays constant, no gap. Source in/out follow like trim. Reject under 50ms or past asset bounds. Abutting handles use a gold `col-resize` cursor. Shift+drag on that edge is still ripple trim.

## Lane solo

Status: TEST-VERIFIED (DOM). Live lane S click: NOT VERIFIED.

Timeline track headers (V1–A2) have S next to M, wired to `{ type: "toggleSolo" }` — same command as mixer S. No Master solo.

## Changelog this follow-up (2026-08-30 06:27 UTC)

- Ripple trim (Shift+edge-drag). TEST-VERIFIED. Live drag: NOT VERIFIED.
- Roll edit on abutting edges. TEST-VERIFIED. Live drag: NOT VERIFIED.
- Timeline lane-header S. TEST-VERIFIED (DOM). Live click: NOT VERIFIED.

## Changelog prior (2026-08-30 06:18 UTC)

- Named `applyCommand` / `EditorCommand`. TEST-VERIFIED.
- Ripple delete (Shift+Delete). TEST-VERIFIED. Live: NOT VERIFIED.
- Track solo + mixer S + shared audible rule. TEST-VERIFIED. Live mix: NOT VERIFIED.
- JKL shuttle 1/2/4. TEST-VERIFIED. Live: NOT VERIFIED.
- Clip nudge `,` / `.`. TEST-VERIFIED.

## Changelog prior (2026-08-30 05:55 UTC)

- Zoom max is 48000 px/s (was 400). Persist accepts the new range. Ruler steps down to milliseconds. Playhead-lock tested at 2000 and 12000. TEST-VERIFIED. Live `+` past 400: NOT VERIFIED.

## Changelog prior (2026-08-30 05:52 UTC)

- Preview/Arrange splitter is an 18px ns-resize bar with a gold grip; Preview/Inspector is a 14px ew-resize bar with a gold grip. TEST-VERIFIED (DOM + cursor). Live drag: NOT VERIFIED.
- Markers, overlay, arrange overflow-y, export dialog already on this branch after `6fb9664`. Pull past that commit.

## Changelog prior (2026-08-30 05:50 UTC)

- Export opens an in-app dialog with progress and Abbrechen (AbortController). Cancel is not success; no download. TEST-VERIFIED. Live cancel: NOT VERIFIED.

## Changelog prior (2026-08-30 05:45 UTC)

- Markers: drag time, per-marker Delete/Backspace/×/context menu. TEST-VERIFIED. Live drag: NOT VERIFIED.
- Mixer collapse at pane top-left: collapsed = MST only. TEST-VERIFIED. Live click this run: NOT VERIFIED.
- Preview/Arrange splitter cursor is ns-resize; drag clamps and persists. TEST-VERIFIED. Live drag: NOT VERIFIED.

## Changelog prior (2026-08-30 05:40 UTC)

- A-track clip preview is a filled min/max peak envelope (~1 pair per CSS pixel), not gapped bars. Zoom re-samples. Mipmap cached after decode. TEST-VERIFIED. Live clip pixels: NOT VERIFIED.

## Changelog prior (2026-08-30 05:34 UTC)

- Projekt + MEDIA left rail hidden by default; overlay opens from toolbar Save/Open. TEST-VERIFIED. Live overlay: NOT VERIFIED.
- Preview vs Inspector horizontal split, persisted. TEST-VERIFIED. Live drag: NOT VERIFIED.
- Arrange overflow-y auto so A2 stays reachable when preview is tall. TEST-VERIFIED. Live scroll: NOT VERIFIED.

## Changelog prior (2026-08-30 05:00 UTC)

- Compact Projekt panel: last file name, remembered folder (handle `.name` or “Ordner gemerkt”), recents, Speichern / Speichern unter / Öffnen / Ordner wählen. TEST-VERIFIED. Live pickers opened then cancelled: RUNTIME-VERIFIED. No fake `C:\` path.
- Mixer column pinned beside the timeline (228px, not width 0). Live A1 fader drag: RUNTIME-VERIFIED.
- MEDIA short display names + tooltip. Disk names unchanged. TEST-VERIFIED.

## Changelog prior (2026-08-30 04:46 UTC)

- Cubase-style mixer strip right of the timeline (V1–A2 + Master). TEST-VERIFIED (curve/persist). Live fader: later RUNTIME-VERIFIED (05:00).

## Changelog prior (2026-08-30 04:42 UTC)

- Save/Open remember last project folder via File System Access handles. TEST-VERIFIED (mocked). Live picker: later RUNTIME-VERIFIED (05:00, dialogs cancelled).
- Status shows filename; fallback admits path unknown. TEST-VERIFIED.

## Changelog prior (2026-08-30 04:31 UTC)

- Adaptive ruler: no overlapping labels at 2.5 px/s / ~400s. TEST-VERIFIED. Live ruler: NOT VERIFIED.
- Audio waveform + video filmstrip on arrange clips (async, non-blocking). TEST-VERIFIED (generator + stub). Live pixels: NOT VERIFIED.

## Changelog prior (2026-08-30 04:21 UTC)

- Non-Fit zoom (+ / wheel / applyZoom) keeps the playhead in view (DAW-style). TEST-VERIFIED. Live + / wheel: NOT VERIFIED.
- Fit still full-duration, scrollMs=0. TEST-VERIFIED.

## Changelog prior (2026-08-30 04:17 UTC)

- Split key is S (not V). Ctrl+V pastes. TEST-VERIFIED.
- Cut = Ctrl+X (`applyCut`). Copy stays non-destructive. TEST-VERIFIED.
- Clip-menu shortcut labels + overlay/toolbar/transport S. TEST-VERIFIED. Live menu: NOT VERIFIED.
- Zoom floor / Fit for long WAV. TEST-VERIFIED. Fit click / wheel in UI: NOT VERIFIED.
- Sequential multi-file Import (prior): TEST-VERIFIED. Picker UI: NOT VERIFIED.

## Commits on this branch (tip)

Tip after this follow-up is recorded in git. Prior command-dispatch tip: `14a117f`.

## Not added

chat, Ollama, vault, AI Arrangement, Beats, AI_EVENTS, VIS TrackId, MilkDrop, Butterchurn, ffmpeg.wasm, MediaRecorder-as-MP4, unpublished deps, V4 file copies, publish, sale.
