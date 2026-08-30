# V5 Evidence

Stand: 2026-08-30 08:04 UTC. Export destination before encode on PR #1. Commands below are from this follow-up run unless noted.
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

exit 0. vite 7.3.6, 155 modules. Outputs:
- dist/index.html 0.41 kB
- dist/assets/index-Bc8mcmyi.css 17.23 kB
- dist/assets/index-BWuAMEoS.js 703.55 kB
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

exit 0. vitest 3.2.7. **309 passed / 42 files**. Start 08:04:43 UTC. Duration 8.27s.

New this follow-up: picker cancel → no dialog/encode; picker confirm → dialog `fileName` is the handle name and encode starts after; success writes via `createWritable` not `<a download>`; fallback without FSA uses `downloadMp4` after encode and says so; no `C:\` in status/dialog. Prior group slip units stay green (304 → 309).

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

`importFiles` now places each new clip at `lastClipEndMsOnTrack` for the matching track (V1 or A1 unless the session target is already V2/A2). Same-kind files in one import sit end-to-end. Mixed picker: videos sequential on video track(s), audio sequential on audio track(s). Existing clips are not moved; new clips append after the last end on that track. Empty track → start 0. Media-browser Place-at-playhead still uses `placeAsset` (pairs when `hasAudio`).

A video file with `hasAudio: true` also places an A clip on the first free A lane (A1 then A2) at the **same** start without overlap. Same duration/source/rate. Shared `linkId`. Sequential files still abut; the pair inside one file is simultaneous. Video-only / unknown audio / no free A lane → V-only (P11 V-audio). Audio-only stays A-only.

`tests/media/import.test.ts` (13):
- text/png throw `ImportError` WRONG_TYPE
- wav → audio, mp4 → video
- place video on V1 and V2, audio on A1 and A2
- video on A1 rejected
- two videos sequential on V1 (0 then 1000)
- two audios sequential on A1
- mixed video+audio independent tracks
- append after an existing V1 clip (start 200 dur 800 → new at 1000; old start unchanged)
- single file on empty A1 starts at 0
- video+audio (`hasAudio`) creates V+A pair + `linkId`; video-only does not
- two AV files abut on V; each A clip starts with its V mate (not after the previous A end)

No live multi-file picker this follow-up.

## Timeline

Status: TEST-VERIFIED (edit units + zoom-fit). UI drag / Fit click: NOT VERIFIED.

Existing units still green (41 in `timeline.test.ts`): prior plus slide +N/−N, span invariant, 50ms hard-stop, no-neighbor/gap no-op, two-/three-clip group slide, gap/cross-track/missing-outer no-op, single match. Also move/clamp, kind reject, V1→V2, split + 50ms edge guard, snap, undo/redo, IN>OUT, trim, mute, loop, ripple-delete, solo, ripple-trim, roll, group move/delete. Rate-1 trim/split/roll/slip/slide stay 1:1. Rate ≠ 1 mapping lives in `tests/core/rate.test.ts`.

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

Split is **S**, not V. Paste is Ctrl+V. Cut is Ctrl+X. Copy is Ctrl+C (non-destructive). Bare X still clears IN/OUT. **Ctrl+Shift+L** (Cmd+Shift+L via `ctrlKey || metaKey`) unlinks a living A/V pair. Ctrl+L without Shift is unused. Bare L stays shuttle. Letter shortcuts ignore ctrl/meta except the explicit chords.

`tests/app/keys.test.ts` (16): prior plus Alt+,/. group slip on a contiguous selection; gapped selection no-ops; Shift+Alt still slides.

`tests/timeline/clip-menu.test.tsx` (4): prior plus overlay row Ctrl+Shift+L / Unlink A/V pair.

`?` overlay opened this run: RUNTIME-VERIFIED (labels visible). Live ripple/nudge/JKL on clips: NOT VERIFIED.

## Preview / playback

Status: TEST-VERIFIED

`tests/preview/playback.test.ts` (5): sourceTimeAt, loop IN/OUT stop, bounds from clip extent, reverse shuttle stop/wrap, 1→2→4 rate table.
Live JKL shuttle in a browser: NOT VERIFIED (not required this VM).
No video frame seen and no audio heard this run.

Preview audio now multiplies `gainAtClipTime` (fade × clip gain) into `mixLinearGain` (track fader / master / mute-solo still win). Preview video sets element opacity from the same factor (clamped 0..1). Live fade hear/see: NOT VERIFIED.

Preview video/audio set `playbackRate` from `Clip.rate`. `sourceTimeAt` is sourceIn + clip-localMs × rate. Live rate hear/see: NOT VERIFIED.

`<video>` stays muted (no double audio). V1/V2 hidden `<audio>` elements play the same object URL through the existing Web Audio tap (MediaElementSource → gain → pan → analyser → mixer). Mute/solo/fader/clip-gain/fades/rate on V tracks match A. MixPeaks V1/V2 read those analysers — 0 when no samples, not a fake meter. Live V-audio hear / meter: NOT VERIFIED.

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

Right of the arrange/timeline (`.arrange-row`: timeline | 228px mixer). Collapse control is top-left of the mixer pane. Collapsed = **MST only** (V1–A2 unmounted, not deleted). Expanded = V1 V2 A1 A2 + MST. Persist `resonance-studio-v5-mixer-collapsed`. Vertical fader, dB label, peak meter. Mute stays a separate switch. Clip Gain in the inspector is unchanged. V1–A2 now have a pan range above the fader (L/C/R label). Master has no pan.

Layout CSS: mixer `min-width`/`width` 228px, not `display:none`. Arrange row has a reserved height so the strip cannot collapse to width 0. Live: mixer sat beside the timeline; A1 fader dragged from 0.00 dB to about -7.31 dB; status showed the A1 dB.

Curve: linear = 10^(dB/20). 0 dB = 1. -6 dB ≈ 0.501. Bottom / -∞ = 0. Track `volume`, `pan`, and `masterVolume` persist in `.resonance.json`. Preview applies track+master via GainNodes when Web Audio is up, then StereoPannerNode last when the tap exists; export bakes the mix into clip gain then pans. VIS is not a mixer channel.

`tests/mixer/volume.test.ts` (9): prior six plus equal-power −1/0/+1, `setTrackPan` persist, legacy missing pan → 0, job copies pan.

Mixer S sits next to M on V1–A2 only (not Master). TEST-VERIFIED (DOM). Chrome S buttons seen this run: RUNTIME-VERIFIED (empty project, no click). Live S click / audible mix: NOT VERIFIED.

## Persistence

Status: TEST-VERIFIED

Memory store hydrate + serialize strip blob URLs: pass.
Visualizer field round-trips; missing `visualizer` deserializes to `{ enabled: true, muted: false, sceneId: "resonance-wave" }`.
Legacy clip JSON without `fadeInMs` / `fadeOutMs` loads as 0 / 0 (`tests/core/fades.test.ts` + persist deserialize).
Legacy clip JSON without `rate` loads as 1.
Legacy clip JSON without `linkId` loads unlinked.
Legacy track JSON without `pan` loads as 0.
`createIndexedDbBlobStore` exercised with an in-process IDB shim (`tests/helpers/fake-indexeddb.ts`). That is not a browser IndexedDB and not a page reload.

IndexedDB page-reload: NOT VERIFIED (no browser reload this run).

## Inspector

Status: TEST-VERIFIED (0 / 1 / 2+ / unlink). Live fields / Unlink click: NOT VERIFIED.

0 selected → “No clip selected.” (track/project empty as before). 1 selected → clip fields including Gain, Rate, Fade in (ms), Fade out (ms). 2+ selected → count only (`"3 clips"`), no multi-inspector. Field layout unchanged. **Unlink** (`data-testid="inspector-unlink"`) appears after the existing block when any selected id has a living same-`linkId` mate (including the 2+ count view). Hidden when unlinked, orphan `linkId`, or nothing selected. Click dispatches `{ type: "unlinkClips", clipId }` on the first selected member with a mate. After unlink the control hides. No relink. `tests/inspector/inspector.test.tsx` (6). Duration field writes `sourceOut = sourceIn + duration * rate`. Source-in / source-out resize timeline duration via `sourceSpan / rate`. Rate field still goes through `setClipRate` (unchanged).

## Export

Status: TEST-VERIFIED (fail planner + ftyp + cancel dialog). Successful H.264 encode: NOT VERIFIED this run. Live cancel: NOT VERIFIED.

Click Export → native MP4 `showSaveFilePicker` **first** (`suggestedName` = `job.fileName`, typically `Untitled_Resonance.mp4`; `startIn` = last project folder or `documents`). Types are `video/mp4` / `.mp4` only — not project JSON. Dialog and encode do not start until the user confirms a file. AbortError / cancel → no dialog, no encode, status stays idle (same as Save cancel). After pick: existing in-app dialog shows `handle.name` (never a fake absolute path), then encode. Success writes the blob with `handle.createWritable`. `downloadMp4` (`<a download>`) is not called when a writable handle exists. If `showSaveFilePicker` is missing: encode then `downloadMp4`, status `Browser-Downloads (Pfad unbekannt)`. Parent directory is remembered for next `startIn` when `getParent` exists; the project `.json` `fileHandle` is not replaced by the MP4 handle.

Close/X while running is still **Abbrechen**. Abort uses `AbortController` (`hooks.signal`); result is `aborted: true`, `success: false`, no blob, no write, no `downloadMp4`. Preview/arrange stay interactive (`pointer-events: none` on the layer).

`tests/export/export-destination.test.ts` (5). Dialog still unit-tested in `tests/export/export-dialog.test.ts` / `export-dialog-dom.test.tsx`. Live picker: NOT VERIFIED.

This environment has no `VideoEncoder`. `exportTimeline` returns FAIL WebCodecs / WebM is not a fallback (unit), or `aborted` if the signal is already aborted.

Also unit-green:
- empty project / empty job FAIL
- IN >= OUT throws
- missing-only video FAIL `missing:user-video.mp4`
- WebM bytes rejected as MP4
- synthetic mux has ftyp `isom`/`avc1` (not a runtime user export)
- job copies visualizer scene; encode features stay synthetic 120 BPM

audio export: NOT IMPLEMENTED. AAC mixer/encoder functions exist in `src/core/exporter/audio.ts` but this run did not mux AAC and did not produce an MP4 with an audio track. Do not treat that code as proven. `mixJobAudio` now schedules a linear fade envelope from `fadeInMs`/`fadeOutMs` on top of the already-baked clip/track/master gain, then sets `playbackRate` from `Clip.rate` and plays the source-window length. That envelope is unit-tested via `clipGainEnvelope` / `gainAtClipTime`, not by rendering OfflineAudioContext in this VM. Export-frame video `sourceTimeSec` is sourceIn + localMs × rate. Visualizer paint is not faded. Live export of fades/rate: NOT VERIFIED.

`audioClipsForMix` includes present V1/V2 clips (not audio-kind only) unless that V clip has a living linked A clip (A carries the sound). `mixJobAudio` still skips a decode that throws or has no channels (video-only file). Mute/solo already empty the job track. V-track volume/pan/fades/rate use the same path as A. Live V-audio in an exported file: NOT VERIFIED. AAC still NOT IMPLEMENTED.

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

- Live V-track audio (preview hear / MixPeaks / export) NOT VERIFIED.
- Live clip rate (preview/export hear/see) NOT VERIFIED.
- Live trim / ripple / roll / slip / slide / split / inspector at rate ≠ 1 NOT VERIFIED (units only).
- Live slide / group slide (Ctrl+Alt+drag / Shift+Alt+,/.) NOT VERIFIED.
- Live preview/export of track pan NOT VERIFIED (helper + graph wiring are unit-tested only). Preview pan needs the Web Audio tap (`StereoPannerNode`); HTML element `.volume` cannot pan.
- Live fade-handle drag NOT VERIFIED (hit + pixel map + DOM units only).
- Live marquee drag NOT VERIFIED (geometry + jsdom pointer units only).
- Live preview/export of clip fades NOT VERIFIED (math + mix schedule + opacity wiring are unit-tested only).
- Audio export NOT IMPLEMENTED (no AAC track proven). Do not claim AAC implemented.
- IndexedDB across a real page reload NOT VERIFIED.
- Start-V5.cmd Windows double-click NOT VERIFIED.
- Full Import→Edit→Preview→Persist→Export click-path NOT VERIFIED. VIS scene cycle and earlier Projekt/mixer clicks were pointer-tested. Overlay / h-split / arrange-scroll live this run: NOT VERIFIED. Recents after a completed save: NOT VERIFIED.
- VIS encode uses SYNTHETIC 120 BPM features, not live FFT.
- Successful user-clip H.264 MP4 encode NOT VERIFIED this run (no VideoEncoder here).
- src-tauri leftover unused.
- Live linked A/V import / split / move / unlink click / Ctrl+Shift+L / group slip drag / export save picker NOT VERIFIED (units only).
- No elastic audio, crossfade objects, or automation curves.
- No relink, link-picker, or nested sequences. Unlink chrome is inspector button + Ctrl+Shift+L only.
- No Shift+click range-select (Ctrl/Cmd+click toggle + Shift+marquee union only).

## Command dispatch

Status: TEST-VERIFIED

`src/app/commands.ts` `applyCommand(session, command)` is the named mutation entry. Adds `unlinkClips`. `slideClip` may carry optional `clipIds` for a contiguous block. Prior: `selectClips` / `setClipRate` / `setTrackPan` / `setClipFades` / `liftRange` / `extractRange`. Copy/cut/paste take the full selection. Timeline math stays in `src/core/timeline.ts`. Same session+command → same clips/tracks/shuttleRate. Not an AI feature. Live toolbar-through-command click: NOT VERIFIED.

## Ripple delete

Status: TEST-VERIFIED

Delete/Backspace stay lift (gap remains). Shift+Delete / Shift+Backspace remove the selected clip(s) and shift later clips on the **same** track left by each clip's duration. Group ripple-delete: per track, later clips first. Other tracks unchanged. One undo restores all. Clip menu: Ripple delete / Shift+Delete. Live menu click: NOT VERIFIED.

## Solo

Status: TEST-VERIFIED (rule + persist + mixer DOM). Live S click / audible mix: NOT VERIFIED.

`Track.solo` defaults false; legacy JSON missing solo → false. If any track is soloed, only soloed tracks are audible; mute still wins on a soloed track. `isTrackAudible` is shared by preview (`topVideoClipAt` / `audioClipsAt` / mix gain) and export `jobFromProject`. Mixer S next to M on V1–A2, not Master.

## JKL shuttle

Status: TEST-VERIFIED (keys + rate table + reverse `advancePlayhead`). Live shuttle: NOT VERIFIED.

Session `shuttleRate` (0 = paused). J reverse, K pause/rate 0, L forward. Repeat L/J: 1× → 2× → 4×, cap 4. Space is play/pause at 1× (pauses any shuttle, then plays +1). rAF advances `delta * rate`. Reverse stops at IN without loop and wraps with loop.

## Nudge

Status: TEST-VERIFIED

`,` / `.` move the selected clip(s) ±1 `FRAME_MS`. Shift+, / Shift+. = 10 frames. Shared delta; start clamps so none go below 0. Track/kind is unchanged (kind-change still rejected by `moveClip`). ArrowLeft/Right still step the playhead.

## Ripple trim

Status: TEST-VERIFIED. Live Shift+edge-drag: NOT VERIFIED.

Normal edge-drag stays lift trim (`trimClip`). Shift+edge-drag is `rippleTrim` via `applyCommand`.

Out-edge: later clips (start ≥ original end) shift by (newEnd − oldEnd) / duration delta. Trimmed clip start stays.

In-edge: lift-trim moves start later and leaves a hole (end unchanged). Ripple then slides the trimmed clip and later clips by the duration delta so the track stays packed — start returns to the original, end follows, sourceIn advances. Example: A 0–1000 + B 1000–2000, ripple in to 200 → A 0–800 (sourceIn 200), B 800. Lift-trim in does **not** move B. Other tracks unchanged. 50ms edge guard still applies. Undo restores the trimmed clip and shifted neighbors.

## Roll edit

Status: TEST-VERIFIED. Live abutting-edge drag: NOT VERIFIED.

When two clips on the same track abut (end of A == start of B within 1ms), edge-drag rolls: A's out and B's in move together, cut time changes, A+B span stays constant, no gap. Source in/out follow like trim. Reject under 50ms or past asset bounds. Abutting handles use a gold `col-resize` cursor. Shift+drag on that edge is still ripple trim.

## Lane solo

Status: TEST-VERIFIED (DOM). Live lane S click: NOT VERIFIED.

Timeline track headers (V1–A2) have S next to M, wired to `{ type: "toggleSolo" }` — same command as mixer S. No Master solo.

## Multi-select

Status: TEST-VERIFIED. Live click / group-drag: NOT VERIFIED.

`Session.selectedClipIds` is the source of truth; `selectedClipId` is the primary (first). `selectionOf` falls back to `selectedClipId` so older tests stay valid. Click clip → that clip only. Ctrl/Cmd+click toggles (no drag). Click empty lane clears. Click an already-selected clip keeps the group, then group-drags. All selected clips get selected chrome; trim handles stay on the primary only.

Group move: same Δms for all selected; clamp so no start < 0 (shared delta); snap the dragged leader if project snap is on; vertical track-change only when exactly one clip is selected. One history entry via `applyCommand` `{ type: "moveClips" }`.

Group lift-delete: Delete/Backspace removes all selected (gaps remain). Group ripple-delete: Shift+Delete, per track later-first. Split (S): 0 or 1 selected → current split-all-under-playhead. 2+ selected → only those containing the playhead. One undo each.

Marquee: empty-lane rubber-band (see Marquee). No Shift+click range. Ctrl/Cmd+click toggle stays.

## Group clipboard

Status: TEST-VERIFIED. Live Ctrl+C/X/V: NOT VERIFIED.

`Session.clipboard` is `Clip[]` (empty = none). Copy snapshots every selected clip. One-clip selection still reports “Copied clip” / “Cut clip” / “Pasted clip”. Cut = copy then lift-delete, one history entry. Paste drops the group at the playhead: earliest clip lands on the playhead, others keep relative start deltas and same-kind tracks (V stays V, A stays A; lane clamped to V1/V2 or A1/A2). New ids. Pasted group becomes the selection. Empty selection: copy/cut still no-op with the existing error. Undo restores.

## Slip

Status: TEST-VERIFIED. Live Alt+drag: NOT VERIFIED.

`{ type: "slip", clipId, deltaMs, clipIds? }` via `applyCommand`. Timeline start and duration stay put; sourceIn and sourceOut slide together. Single unlinked clip clamps: sourceIn ≥ 0, sourceOut ≤ asset duration. Duration does not change. Alt+drag on a clip body (not trim handles) slips that clip — a living linked mate takes the same source delta, or both no-op. 2+ selected ids use `clipIds` (see Group slip). Alt+, / Alt+. = ±1 `FRAME_MS`. Undo restores. Ctrl+Alt stays slide.

## Slide

Status: TEST-VERIFIED. Live Ctrl+Alt+drag / Shift+Alt+,: NOT VERIFIED.

The fourth edit-point tool. Classic slide: selected clip keeps duration and source in/out and moves on the timeline. Previous abutting clip (same track, gap ≤ 1ms) absorbs the left delta (duration / source out). Next abutting clip absorbs the right delta (startMs / source in). The three-clip span length stays constant. Other tracks unchanged.

`slideClip(project, clipId, deltaMs)` sits next to `slipClip`. Delta is clamped so neither neighbor duration goes below `SPLIT_EDGE_GUARD_MS` (50) and source in/out stay inside media. Missing neighbor or gap > 1ms → unchanged project + error (cannot slide into a hole or overlap a non-abutting clip).

Gesture: **Ctrl+Alt+drag** (Ctrl or Meta + Alt) on the clip body, not edges. Does not steal Alt+drag slip, Shift+edge ripple, abutting-edge roll, or Ctrl+click toggle-select. Keys: **Shift+Alt+, / Shift+Alt+.** = ±1 `FRAME_MS`. `{ type: "slideClip", clipId, deltaMs, clipIds? }` via `applyCommand`. One history entry. Undo restores. Contiguous multi-select uses the same command (see Group slide).

Fade handles sit on the clip body (not this slide gesture). Marquee is empty-lane only (does not steal this gesture). No automation or time-stretch.

## Clip fades

Status: TEST-VERIFIED (math + persist + inspector + command). Live preview/export hear/see: NOT VERIFIED.

`Clip.fadeInMs` / `fadeOutMs` default 0. Sanitize missing fields → 0. Each clamped to `[0, durationMs]`. If fadeIn + fadeOut > duration, both scale so they meet in the middle (no overlap).

`gainAtClipTime(clip, localMs)` = linear fade factor (0..1) × `clip.gain`. Linear: 0→1 over fadeIn, 1 in the middle, 1→0 over fadeOut. Shared by:
- preview audio (`mixLinearGain` of that value × track × master; mute/solo still win)
- export `mixJobAudio` (`scheduleGainEnvelope` on the OfflineAudioContext gain node; peak is already-mixed clip/track/master)
- video paint (preview `<video>` opacity; export `ctx.globalAlpha` around video draws only)

Visualizer is not a clip; `paintVisualizer` / VIS canvas are not faded.

Inspector (exactly one clip): Fade in / Fade out (ms), same number+timecode style as duration. `{ type: "setClipFades", clipId, fadeInMs, fadeOutMs }` is one history entry. Undo restores.

Timeline: `.clip-fade-in` / `.clip-fade-out` gradient ramps when fade > 0. `pointer-events: none`. Fade handles are separate (see Fade handles). Trim/roll handles unchanged.

`tests/core/fades.test.ts` (12): factor 0 at t=0 with fadeIn 1000, 1 at t=1000; middle/out; gain multiply; overlap scale; video alpha clamp; envelope points; setClipFades + undo; legacy JSON; job copies fades.

## Range lift / extract

Status: TEST-VERIFIED. Live `;` / `'` / I/O + Delete: NOT VERIFIED.

IN/OUT stay loop/export markers. When both are set and out > in, they also cut:

1. Split every clip that straddles IN or OUT (same 50ms guard as S).
2. **liftRange** (`;`) removes pieces fully inside `[in, out)`. Later clips stay. Gap remains. All tracks. One history entry. Selection clears.
3. **extractRange** (`'`) = liftRange, then each track shifts clips that start at/after OUT left by `(out−in)`. One undo restores splits, deletions, and shifts.

Missing or inverted IN/OUT: no-op (no history). Clip Delete/Backspace still delete the selection when `selectedClipIds` is non-empty. When selection is empty and the range is valid, Delete = liftRange, Shift+Delete = extractRange. Marker delete still wins if a marker is selected and no clip is.

## Track pan

Status: TEST-VERIFIED (helper + persist + command + mixer DOM). Live hear: NOT VERIFIED.

`Track.pan` is −1 (L) … +1 (R), default 0. Master has no pan. Legacy JSON missing `pan` → 0. Clamp to [−1, 1].

Equal-power (shared `equalPowerPan`): L = cos((pan+1)/2 · π/2), R = sin((pan+1)/2 · π/2). Unit: −1 → L=1 R=0; 0 → √2/2 both; +1 → L=0 R=1.

Mute/solo/fader/clip-gain/fades still apply first. Pan is last on that track’s contribution:
- export `mixJobAudio`: `StereoPannerNode` after the fade-gain envelope (splitter/merger fallback uses the same helper)
- live preview: `StereoPannerNode` after each V1/V2/A1/A2 track gain when the Web Audio tap exists

Video tracks store pan. Present V1/V2 clips now enter `audioClipsForMix`. Video-only decode (no channels) is skipped. `<video>` stays muted; V audio is the hidden element + same tap. Video-only files stay silent (no fake meter).

Mixer: horizontal range above the fader on V1 V2 A1 A2, label C / L100 / R100. `stopPropagation` on click and pointerdown. `{ type: "setTrackPan", trackId, pan }` via `applyCommand` (no history, same as fader).

## Clip rate

Status: TEST-VERIFIED (math + persist + command + inspector + clocks). Live hear/see: NOT VERIFIED.

`Clip.rate` default 1. Legacy JSON missing → 1. Clamp 0.25 … 4. Classic NLE speed: source in/out stay. `durationMs = (sourceOutMs − sourceInMs) / rate`. Rate 2 → half timeline length. Rate 0.5 → double. Start stays; the clip grows/shrinks to the right. Fades stay in timeline ms and re-normalize if they would exceed the new duration.

If the new duration would overlap the next same-track clip, reject (unchanged project + error). No auto-ripple. A shrink that leaves a gap is OK.

Inspector (one clip): Rate number field. `{ type: "setClipRate", clipId, rate }` via `applyCommand`. One history entry. A living linked mate gets the same rate and `durationMs = sourceSpan / rate`; if either would overlap its next clip, both no-op.

Preview: `<video>` / `<audio>` `playbackRate`. `sourceTimeAt` = sourceIn + clip-local × rate. Export mix: `AudioBufferSourceNode.playbackRate` + source-window duration. Export video: `sourceTimeSec` uses the same clock. Mute/solo/fader/gain/fades/pan still apply.

No elastic audio, pitch-preserve, or time-stretch UI. Edits that move a source window now use `timelineMs * rate = sourceMs`. Rate itself does not change during trim/roll/slip/slide/split.

`tests/core/rate.test.ts` (16).

## Rate-aware edits

Status: TEST-VERIFIED (units at rate 1 / 2 / 0.5). Live drag / inspector at rate ≠ 1: NOT VERIFIED.

Invariant: `timelineMs * rate = sourceMs`. Helpers: `timelineDeltaToSource` / `sourceDeltaToTimeline`. Rate 1 is identity.

- Out-trim: `sourceOut += Δtimeline * rate`. In-trim: `sourceIn += Δtimeline * rate`. Timeline `SPLIT_EDGE_GUARD_MS` stays; source remaining uses `50 * rate`. Media bounds unchanged.
- Ripple-trim calls `trimClip` then only shifts later starts. Rated clip source follows trim. Rate-1 neighbor that only moves keeps its source window.
- Roll: each side maps through its own rate. Rate-1 neighbor stays 1:1.
- Slip: UI/nudge delta (timeline ms / `FRAME_MS`) converts through rate. 1 frame at rate 2 = 2 frames of source. Source span stays.
- Slide: neighbor source in/out follow the same mapping. Middle clip source in/out unchanged.
- Split: cut source = `sourceTimeAt(cut)`. Both halves keep `clip.rate`.
- Inspector `updateClip`: duration → `sourceOut = sourceIn + duration * rate`. Source-in/out → `duration = sourceSpan / rate`. `setClipRate` not touched.

No elastic audio. Group slide is contiguous same-track only. Marquee is empty-lane only.

## V-track audio

Status: TEST-VERIFIED (mix candidates + gain/pan bake + decode skip). Live preview/export hear: NOT VERIFIED.

`audioClipsForMix` takes every non-missing clip on V1/V2/A1/A2 except a V clip whose living linked A clip is also in the job. Mute/solo still empty the job track first. `mixJobAudio` decodes; 0 channels or throw → skip that clip, mix still succeeds. Same fade envelope, track pan, clip rate as A.

Preview: `<video>` muted. Hidden `<audio>` per V lane, same object URL, same `sourceTimeAt` / `playbackRate` / `gainAtClipTime` / fader / mute-solo / pan as A — skipped when a living linked A clip carries the sound. One playback tap (not a second mixer). MixPeaks V1/V2 are analyser peaks from those lanes.

Unlinked V clips keep this mix. No elastic audio. Marquee is empty-lane only. Group slide is contiguous same-track only.

`tests/export/vtrack-audio.test.ts` (4). `mixClipsAt` in `tests/foundation/models.test.ts`.

## Fade handles

Status: TEST-VERIFIED (hit vs trim + pixel map + DOM). Live drag: NOT VERIFIED.

Ramps stay paint-only (`pointer-events: none`). Selected primary clip gets two inset handles: fade-in just inside the left trim edge, fade-out just inside the right. Cursor `w-resize` / `e-resize` (trim stays `ew-resize`, roll `col-resize`).

Clip width under 48 px → handles hidden, trim edges stay. Alt / Ctrl / Meta on a handle is ignored so slip, slide, and toggle-select still win.

Drag → `applyCommand` `{ type: "setClipFades" }` from the drag base (same live/commit as slip). `normalizeClipFades`: 0..duration, scale if they would overlap. One history entry. Inspector fields unchanged.

Marquee is empty-lane only (does not steal fade handles). Group slide does not steal fade handles. Linked A/V does not steal fade handles. No elastic audio. No crossfade objects. No automation curves.

`tests/core/fade-handles.test.ts` (4). `tests/timeline/fade-handles.test.tsx` (4). `tests/core/fades.test.ts` (12) still green.

## Marquee

Status: TEST-VERIFIED (geometry + DOM pointer). Live drag: NOT VERIFIED.

Pointer-down on empty lane body (not clip, lane header, ruler, fade handle, or trim edge) starts a rubber-band. Drag paints `.marquee-rect`. Pointer-up selects every clip whose body intersects the rect (time overlap × track in the lane span). VIS is in the span for painting/hit but is not a `TrackId` (no clips). Empty click (travel ≤ 3 px) still clears via `onSelect(null)`.

Default marquee replaces `selectedClipIds`. Shift+marquee unions. No Ctrl-toggle on marquee; Ctrl/Cmd+click on a clip still toggles. `{ type: "selectClips", clipIds, union? }` via `applyCommand` — no history. Group move / lift / ripple-delete / copy / cut / paste are unchanged and read `selectedClipIds`.

Does not steal clip-body move, edge-trim, ripple, roll, slip, slide, fade handles, or ruler playhead scrub. `laneAt` uses `elementFromPoint` when present; jsdom falls back to the origin lane.

`tests/core/marquee.test.ts` (3). `tests/timeline/marquee.test.tsx` (5). `selectClips` + group-move in `tests/app/commands.test.ts`.

## Group slide

Status: TEST-VERIFIED (core + command + keys + DOM gesture). Live drag: NOT VERIFIED.

One selected clip: `slideClip` is unchanged. 2+ `selectedClipIds` on the **same** track, each pair abutting (≤1ms), with outer previous and outer next also abutting: the selection is one middle block. Inner clips keep relative starts and source in/out. Outer previous absorbs left (duration / source out). Outer next absorbs right (start / source in). Block duration and prev+block+next span stay constant. Rate does not change (`timelineMs * rate = sourceMs`).

Hard stop (same project + error): cross-track selection, internal gap > 1ms, missing outer neighbor, outer gap > 1ms, or source media would overshoot. Neighbor durations still cannot drop below `SPLIT_EDGE_GUARD_MS`.

Ctrl+Alt+drag on a selected clip in a valid block slides the block (`clipIds`). Shift+Alt+,/. nudges the block when valid; otherwise single-clip slide on the primary. Plain drag (no Ctrl+Alt) still group-moves. Does not steal marquee, fade handles, trim, ripple, roll, or slip.

`slideClips` + `isSlideBlock` in `src/core/timeline.ts`. `{ type: "slideClip", clipId, deltaMs, clipIds? }`.

`tests/timeline/timeline.test.ts` group-slide cases. `tests/core/rate.test.ts` group-slide rate map. `tests/app/commands.test.ts` / `keys.test.ts`. `tests/timeline/group-slide.test.tsx` (2).

## Group slip

Status: TEST-VERIFIED (core + command + keys + DOM gesture). Live drag: NOT VERIFIED.

One selected clip: `slipClip` is unchanged (unlinked clamp; living mate same source delta or both no-op). 2+ `selectedClipIds` on the **same** track, each pair abutting (≤1ms): the selection is one source-clock block. Every member gets the same source-in/source-out delta (from the primary clip’s rate). Start and duration stay. Neighbors do not move. Fades are not copied. Outer neighbors are not required (unlike group slide).

Hard stop (same project + error): cross-track selection, internal gap > 1ms, or any member / living linked mate of any member would exceed source bounds. Do not leave picture and sound desynced.

Alt+drag on a selected clip in a 2+ selection passes `clipIds`. Alt+,/. does the same. Gapped or mixed selection no-ops (does not fall back to slipping the primary). Ctrl+Alt stays slide.

`slipClips` + `isSlipBlock` / `resolveSlipBlock` in `src/core/timeline.ts`. `{ type: "slip", clipId, deltaMs, clipIds? }`.

`tests/timeline/timeline.test.ts` group-slip cases. `tests/core/linked-av.test.ts` mate-of-member. `tests/app/commands.test.ts` / `keys.test.ts`. `tests/timeline/group-slip.test.tsx` (2).

## Linked A/V

Status: TEST-VERIFIED (import + mix skip + split/move/trim/slip/rate/unlink + inspector/shortcut). Live import / slip / rate / Unlink click: NOT VERIFIED.

`Clip.linkId` optional. Legacy JSON missing `linkId` stays unlinked. `MediaAsset.hasAudio` optional; probe may set it on video (`audioTracks` / `mozHasAudio`). Unknown → no pair (V-only + P11 mix).

Import/place of video + `hasAudio: true`: V clip on the chosen V track and an A clip on the first free A lane (A1 then A2) that can take `[start, start+duration)` without overlap. Same start/duration/source in/out/rate. Shared `linkId`. Same video asset on both clips. Sequential files still abut on the V track; the A mate starts with its V clip, not after the last A end. No free A lane → V-only, no silent drop.

Mix: living linked A clip carries audio; that V clip is omitted from `audioClipsForMix` and from the preview V hidden-audio bind. Unlinked V clips keep P11 V-audio. `<video>` stays muted.

Edits that follow a living mate: split (S) at the same timeline time (lefts keep `linkId`, rights get a new shared id), move (same delta; track change stays same-kind), lift-delete and ripple-delete of one lift the other, trim / ripple-trim / roll of a linked edge apply to both. Slip applies the same source-in/source-out delta (start/duration stay); if either side would exceed source bounds, both no-op. `setClipRate` writes the same rate and `durationMs = sourceSpan / rate` on both; if either would overlap the next clip, both no-op. Fades stay independent (each clip’s fades re-clamp to its own new duration). Slide does not follow (neighbors live on different tracks).

`{ type: "unlinkClips", clipId }` clears `linkId` on the pair. After unlink they edit independently. Inspector **Unlink** + **Ctrl+Shift+L** reach that command. No new track types. No relink.

`tests/core/linked-av.test.ts` (13). Inspector unlink in `tests/inspector/inspector.test.tsx`. Shortcut in `tests/app/keys.test.ts`. Import pair cases in `tests/media/import.test.ts`.

## Changelog this follow-up (2026-08-30 08:04 UTC)

- Export picks an MP4 destination before encode (`showSaveFilePicker` / `createWritable`). TEST-VERIFIED. Live picker: NOT VERIFIED.

## Changelog prior (2026-08-30 07:59 UTC)

- Group slip for a contiguous same-track selection (`slipClips` / `slip`+`clipIds`). TEST-VERIFIED. Live drag: NOT VERIFIED.

## Changelog prior (2026-08-30 07:54 UTC)

- Inspector Unlink + Ctrl+Shift+L dispatch existing `{ type: "unlinkClips" }`. TEST-VERIFIED. Live click: NOT VERIFIED.

## Changelog prior (2026-08-30 07:50 UTC)

- Linked slip + `setClipRate` follow a living mate (same source delta / same rate; both no-op on bounds). TEST-VERIFIED. Live: NOT VERIFIED.

## Changelog prior (2026-08-30 07:46 UTC)

- Linked A/V pair on video+audio import (`linkId`, mix skip, split/move/trim/delete follow, `unlinkClips`). TEST-VERIFIED. Live import: NOT VERIFIED.

## Changelog prior (2026-08-30 07:38 UTC)

- Group slide for a contiguous same-track selection (`slideClips` / `slideClip`+`clipIds`). TEST-VERIFIED. Live drag: NOT VERIFIED.

## Changelog prior (2026-08-30 07:33 UTC)

- Rubber-band marquee on empty lanes (`selectClips` replace / Shift+union). TEST-VERIFIED. Live drag: NOT VERIFIED.

## Changelog prior (2026-08-30 07:27 UTC)

- Fade handles on the clip body (`setClipFades` via applyCommand, inset from trim). TEST-VERIFIED. Live drag: NOT VERIFIED.

## Changelog prior (2026-08-30 07:22 UTC)

- V-track audio in preview + export mix (`audioClipsForMix` includes V, hidden V `<audio>` + same tap, MixPeaks from analysers). TEST-VERIFIED. Live: NOT VERIFIED.

## Changelog prior (2026-08-30 07:16 UTC)

- Rate-aware source mapping on trim / ripple / roll / slip / slide / split / inspector duration+source. TEST-VERIFIED. Live: NOT VERIFIED.

## Changelog prior (2026-08-30 07:11 UTC)

- Clip playback rate (`Clip.rate`, `setClipRate`, preview/export clocks). TEST-VERIFIED. Live: NOT VERIFIED.

## Changelog prior (2026-08-30 07:06 UTC)

- Slide edit (`slideClip`, Ctrl+Alt+drag, Shift+Alt+,/.). TEST-VERIFIED. Live: NOT VERIFIED.

## Changelog prior (2026-08-30 07:01 UTC)

- Track pan (`Track.pan`, equal-power, mixer control, `setTrackPan`, mix + preview). TEST-VERIFIED. Live: NOT VERIFIED.

## Changelog prior (2026-08-30 06:56 UTC)

- Per-clip linear fade in/out (`fadeInMs` / `fadeOutMs`, `gainAtClipTime`, inspector `setClipFades`, mix + video alpha, timeline ramps). TEST-VERIFIED. Live preview/export: NOT VERIFIED.

## Changelog prior (2026-08-30 06:49 UTC)

- Range lift (`;`) and extract (`'`). TEST-VERIFIED. Live: NOT VERIFIED.

## Changelog prior (2026-08-30 06:44 UTC)

- Group copy / cut / paste (relative time + same-kind tracks). TEST-VERIFIED. Live: NOT VERIFIED.
- Slip (Alt+drag / Alt+, / Alt+.). TEST-VERIFIED. Live: NOT VERIFIED.

## Changelog prior (2026-08-30 06:38 UTC)

- In-edge ripple trim packs the track (later clips follow duration delta). TEST-VERIFIED. Live Shift+in-edge: NOT VERIFIED.
- Multi-select (Ctrl/Cmd+click), group move, group lift-delete, group ripple-delete, multi-split. TEST-VERIFIED. Live clicks/drags: NOT VERIFIED.
- Inspector 2+ shows count only. TEST-VERIFIED. Live: NOT VERIFIED.

## Changelog prior (2026-08-30 06:27 UTC)

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

Tip after this follow-up: export destination evidence (this commit). Feature `854624b`. Assigned start: `9611e06`. Prior group-slip evidence: `9611e06`.

## Not added

chat, Ollama, vault, AI Arrangement, Beats, AI_EVENTS, VIS TrackId, MilkDrop, Butterchurn, ffmpeg.wasm, MediaRecorder-as-MP4, unpublished deps, V4 file copies, publish, sale.
