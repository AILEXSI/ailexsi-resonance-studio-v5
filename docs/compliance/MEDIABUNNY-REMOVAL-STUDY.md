# Mediabunny Removal Study

Investigation / controlled spike (MBR-1 / MBR-2). **Not a removal.**

Question: can the existing HTML/WebView video path replace Mediabunny for Resonance production export without reducing frame accuracy, stability, or supported behavior?

Method: FACT → EVIDENCE → RESULT → DECISION. Licensing simplicity was not used as a reason to drop a working decoder.

| Item | Value |
| --- | --- |
| Initial `main` SHA | `a922c6eb77cb68494fbde9bd222a16b46ad00b32` (verified `git rev-parse HEAD` before branch) |
| Spike branch | `cursor/mediabunny-removal-study-ffe1` |
| Mediabunny version | **1.55.3** (`package.json` `^1.55.3`, lock + `node_modules/mediabunny/package.json`) |
| License | MPL-2.0 (`node_modules/mediabunny/LICENSE` is the standard MPL-2.0 text; no Exhibit B “Incompatible With Secondary Licenses” notice found on the installed tree) |
| Production default after spike | Mediabunny (`getFrameSourceBackend()` === `"mediabunny"`) |
| Mediabunny removed | **NO** |
| package-lock changed | **NO** |
| SBOM regenerated | **NO** |
| Product license changed | **NO** |
| schemaVersion / app version | **5** / **5.0.0** (untouched) |
| AUTO line | Untouched |

## Current Responsibility

### MEDIABUNNY RESPONSIBILITY

Verified from `src/core/exporter/frame-source.ts` (the **only** production import of `"mediabunny"`):

| API | Used | Purpose |
| --- | --- | --- |
| `Input` | YES | Open a media file from `BlobSource` or `UrlSource` |
| `BlobSource` | YES | `blob:` / `file:` URLs (fetch → blob) |
| `UrlSource` | YES | `http(s):` URLs |
| `ALL_FORMATS` | YES | Passed as `formats` (MP4 plus unused sibling formats) |
| `getPrimaryVideoTrack()` | YES | Select the video track |
| `track.canDecode()` | YES | Abort to HTML fallback if WebCodecs cannot decode the track |
| `VideoSampleSink` | YES | Decode pipeline |
| `samplesAtTimestamps()` | YES | Request decoded samples at export source timestamps (seconds) |
| `VideoSample.drawWithFit(..., { fit: "contain" })` | YES | Paint into the export canvas |
| `input.dispose()` | YES | Cache teardown in `clearFrameSources()` |

Mediabunny’s own contract for a timestamp (`VideoSampleSink.getSample` / `samplesAtTimestamps` docs): return the last sample in presentation order whose start timestamp is **≤** the request. That is the frame-accurate source for export.

The in-tree comment that motivated Mediabunny (`frame-source.ts`): *“HTMLVideoElement.currentTime snaps to GOP keyframes.”* That claim is **an existing design assumption**, re-tested below.

### MEDIABUNNY NOT RESPONSIBLE FOR

| Subsystem | Owner | Evidence |
| --- | --- | --- |
| H.264 **output** encode | WebCodecs `VideoEncoder` `avc1.42001f` | `src/core/exporter/webcodecs.ts` |
| AAC encode | first-party | `src/core/exporter/audio.ts` |
| MP4 mux | first-party ISO-BMFF writer | `src/core/exporter/mp4.ts` |
| Audio mix / pan / automation | first-party | `audio.ts`, `volume.ts`, `volume-automation.ts` |
| Timeline / Source In-Out / rate | first-party | `src/core/models.ts` `sourceTimeAt`, `clipRateOf`; export remap in `job.ts` |
| Fades | first-party canvas alpha | `src/core/fades.ts` + `webcodecs.ts` `exportPaintAlpha` |
| Transitions / AUTO / VIS / black | first-party compositor | `src/core/transition.ts` |
| Visualizer paint | first-party | `src/core/visualizer` |
| Still images | first-party | `src/core/still.ts` |
| Preview playback | `HTMLVideoElement` (not Mediabunny) | `src/ui/preview/Preview.tsx` |

Mediabunny’s package is a full read/write/convert toolkit (MP4, MOV, MKV/WebM, HLS, MP3, …). Resonance imports a **narrow decode+draw** slice only.

### Import / inventory surface

| Location | Role |
| --- | --- |
| `src/core/exporter/frame-source.ts` | **Only** `from "mediabunny"` in `src/` |
| `src/core/exporter/webcodecs.ts` | Calls `getDecoder` / `samplesAtTimestamps` (no direct import) |
| `src/core/still.ts` | Imports `drawContain` only (first-party helper) |
| `package.json` / `package-lock.json` | Direct runtime dep 1.55.3 |
| `docs/compliance/LICENSE-INVENTORY.md` | MPL-2.0 YELLOW |
| `docs/compliance/sbom-npm.cdx.json` | Component `@ailexsi/resonance-studio-v5@5.0.0\|mediabunny@1.55.3` |
| `docs/compliance/SBOM.md` / `V5-EVIDENCE.md` | Prior MODE A notes |
| Tests | No direct `mediabunny` import; spike tests go through `frame-source.ts` |
| Vite `dist/` (this pass) | Main chunk still contains minified Mediabunny (`VideoSample` ×22, `samplesAtTimestamps`). MPL text **not** copied into `dist/`. Harness/fixtures **not** in `dist/`. |

## Existing Native/HTML Alternative

Already implemented in `src/core/exporter/media.ts` and used when `getDecoder()` returns null:

1. `loadVideo(src)` — cached `HTMLVideoElement`, `preload=auto`, `loadeddata`
2. `seekVideo(el, t)` — `currentTime = t`, wait `seeked` (2s timeout), then `requestVideoFrameCallback` (250ms present timeout) or double `rAF`
3. `ctx.drawImage(video, …)` via `drawContain` in `paintHtmlVideo` (`webcodecs.ts`)

`isPlayableSource` allows only `blob:`, `file:`, `http:`, `https:`.

Preview already seeks HTMLVideo with an 80ms slack (`Preview.tsx`). Export is the accuracy-critical path.

## Experimental Backend

Smallest isolated switch. **Not a production setting.**

- `FrameSourceBackendId = "mediabunny" | "htmlvideo"`
- `setFrameSourceBackend("htmlvideo")` → `getDecoder()` returns `null` immediately
- `exportWithWebCodecs` skips the 20s decoder open and uses the existing `paintHtmlVideo` loop
- `resetFrameSourceBackend()` restores Mediabunny
- Default remains Mediabunny; `clearFrameSources()` does not change the switch

No exporter redesign. `media.ts` unchanged. Mediabunny stays in `package.json`.

## Test Media

Generated on this VM with `ffmpeg` 6.1.1 `libx264` by `node scripts/generate-mbr-media.mjs`. **Not** internet media. **Not** `user-video.mp4`.

Each frame is a 160×90 RGB24 painting: 4×4 black/white barcode of the frame index (16 bits) plus a color stripe. Encoded Baseline, `bf=0`, `scenecut=0`, fixed GOP.

| File | fps | duration | GOP | frames | keyframes (ffprobe `nokey`) |
| --- | --- | --- | --- | --- | --- |
| `mbr-cfr-30-g1-2s.mp4` | 30 | 2s | 1 (all-intra) | 60 | 60 |
| `mbr-cfr-30-g30-2s.mp4` | 30 | 2s | 30 | 60 | 2 |
| `mbr-cfr-30-g60-8s.mp4` | 30 | 8s | 60 | 240 | 4 |
| `mbr-cfr-30-g250-28s.mp4` | 30 | 28s | 250 | 840 | 0, 8.333s, 16.667s, 25s |
| `mbr-cfr-24-g24-2s.mp4` | 24 | 2s | 24 | 48 | 2 |
| `mbr-cfr-25-g25-2s.mp4` | 25 | 2s | 25 | 50 | 2 |
| `mbr-cfr-50-g50-2s.mp4` | 50 | 2s | 50 | 100 | 2 |
| `mbr-cfr-60-g60-2s.mp4` | 60 | 2s | 60 | 120 | 2 |

Identity rule used for scoring: `expectedFrame = floor(requestedSec * fps)`. Mediabunny’s ≤-timestamp rule matches that for these CFR files.

## Frame Accuracy Results

Harness: `scripts/mbr-frame-harness.html` via `node scripts/mbr-run-chrome.mjs`.

Environment: **AGENT/BROWSER VERIFIED** — HeadlessChrome/148.0.0.0, Linux x86_64, `VideoDecoder` present, `requestVideoFrameCallback` present.

| Backend | EXACT | WITHIN 1 FRAME | >1 FRAME ERROR | FAILED SEEK | TIMEOUT | WRONG FRAME | UNKNOWN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A Mediabunny | **840** | 0 | 0 | 0 | 0 | 0 | 0 |
| B HTMLVideo | **800** | **40** | **0** | 0 | 0 | 0 | 0 |

Compared 840 timestamps. A/B same presented index: 800/840.

The 40 HTML disagreements are **±1 frame only** (21 at +1, 19 at −1). Concentrated on all-intra 30 fps (20) and a handful of GOP/keyframe-adjacent times. Example (all-intra): request `0.066666s`, expected 1, Mediabunny painted 1, HTML painted 2 while `video.currentTime` still reported `0.066666`. That is a presented-frame vs requested-time mismatch, not a GOP snap.

Long-GOP keyframe neighborhood (`mbr-cfr-30-g250-28s`, KFs at 0 / 8.333 / 16.667 / 25):

| requestedSec | expected | A | B | B Δ |
| --- | --- | --- | --- | --- |
| 0.000 | 0 | 0 EXACT | 0 EXACT | 0 |
| 8.300 (just before KF) | 248 | 248 | 248 | 0 |
| 8.333 (exact KF) | 249 | 249 | 250 | +1 |
| 8.367 (just after KF) | 250 | 250 | 250 | 0 |
| 16.633 / 16.667 / 16.700 | 499 / 500 / 501 | EXACT | EXACT | 0 |
| 24.967 (just before KF) | 749 | 749 | 748 | −1 |
| 25.000 / 25.033 | 750 / 751 | EXACT | EXACT | 0 |

**RESULT:** On Chrome 148 Linux, the historical “HTML snaps to GOP keyframes” assumption is **not reproduced**. HTML never missed by more than one frame, including mid-GOP on a 250-frame GOP. Mediabunny is still the only **exact** backend.

## Random Seek Results

Pattern required: 10s, 2s, 25s, 5s, 18s, 1s on the 28s GOP-250 file (not monotonic).

| t (s) | expected | A | B |
| --- | --- | --- | --- |
| 10 | 300 (mid GOP after 8.333 KF) | 300 EXACT | 300 EXACT |
| 2 | 60 | 60 EXACT | 60 EXACT |
| 25 | 750 (exact KF) | 750 EXACT | 750 EXACT |
| 5 | 150 | 150 EXACT | 150 EXACT |
| 18 | 540 (mid GOP after 16.667 KF) | 540 EXACT | 540 EXACT |
| 1 | 30 | 30 EXACT | 30 EXACT |

**RESULT:** Random / reverse-order seeks were EXACT on both backends. No keyframe-only snap, no failed seek, no timeout.

## Resonance Semantics Results

Planner / compositor semantics are **backend-independent**. Both backends receive the same `sourceTimeSec` list. Targeted vitest (`tests/export/mbr-semantics.test.ts` + existing export/transition/rate suites) did **not** change fade, transition, VIS, or IN/OUT rules to make HTML pass.

| Semantic | How tested | Result |
| --- | --- | --- |
| Hard cut V1→V2 | `videoClipAt` at 0 / 999 / 1000 / 1500 | V1 then V2; timestamps identical on both backends |
| Source In/Out + shortened clip + rate | `sourceTimeSec` + `jobFromProject` | Same numbers; clamped below `sourceOut` |
| Repeated segments | two clips, same asset, gap between | Independent windows; same source time at each local 0 |
| Fade in/out | `videoAlphaAtClipTime` | Compositor alpha; not a decode concern |
| Crossfade | `compositeVideoAt` mid-window | Both layers >0 alpha; AUTO not VIS |
| VIS ↔ video / black | `resolvePictureSource` + missing clip | VIS in gap; missing-only still FAIL |
| Export IN/OUT | job remap 500–2500 | `sourceIn/Out` 500/2500; `sourceTimeSec` same on HTML switch |
| Clip rate 2 + Source In 2000 | Chrome paint at `sourceTimeSec` | A and B both EXACT (frames 60, 75, 90, 119) |

**RESULT:** Semantics do not depend on Mediabunny. Decode identity for those export timestamps was EXACT on both backends in Chrome.

## Performance Results

Same 840 retrievals, sequential A then B, decoder/video caches as in production.

| | A Mediabunny | B HTMLVideo |
| --- | --- | --- |
| Total retrieval time | **3.02 s** | **210.0 s** |
| Average / frame | **3.59 ms** | **250.00 ms** |
| Worst | 33.1 ms | 276.6 ms |
| Timeouts | 0 | 0 |

B’s average **equals `PRESENT_TIMEOUT_MS` (250)** in `seekVideo`. `requestVideoFrameCallback` exists on the element but in this headless session the present wait consistently burned the full timeout. That is **not** proof that Windows WebView2 will be 250 ms/seek — it is proof that the existing HTML path is **environment-sensitive**.

If a 30 fps export of 28 s (840 frames) always hit 250 ms/seek, HTML-only export would be ~3.5 minutes of seeks vs ~3 seconds of Mediabunny decode. That is not practical **in this environment**.

HTMLVideo-only class for **this VM**: **E environment-dependent** (accuracy ≤1 frame here; latency dominated by the 250 ms present cap). Not class A (not exact vs current backend; latency not production-quality here). Not class C (not inaccurate). Not class D unstable (0 failures).

## Environment Limitations

| Claim | Status |
| --- | --- |
| jsdom / vitest can decode H.264 | **NO.** `HTMLVideoElement.videoWidth === 0`; no `requestVideoFrameCallback`. Pixel A/B is Chrome-only. |
| Agent Chrome 148 headless = shipping WebView2 | **NO.** |
| This VM can build a Windows EXE | **NO** (prior pass: `llvm-rc` / `tauri-winres` missing). |
| ffmpeg available to generate identity media | **YES** (6.1.1 + libx264). |
| User fixtures (`user-video.mp4`) used as ground truth | **NO** (generated media only). |

Classification of this pass: **AGENT/BROWSER VERIFIED**. Not Windows WebView2. Not EXE HUMAN-PROVEN.

## Windows Verification Required

Shipping product: Tauri on Windows / WebView2.

**WINDOWS WEBVIEW2 VERIFIED: NO**  
**WINDOWS HUMAN TEST REQUIRED: YES**

Do not treat this study as permission to remove Mediabunny.

### Minimal owner plan (Windows EXE / `npx tauri dev`)

1. Build or run this branch on the owner Windows machine (`npm run web:dev` **and** `npx tauri dev` / Root-Exe). Record WebView2 / Edge version (Help → About or `edge://version` equivalent).
2. Open `http://127.0.0.1:1421/scripts/mbr-frame-harness.html` (Vite; file is **not** in `public/` / `dist`).
3. Wait for `MBR_DONE`. Save `window.__MBR_RESULT` (or the on-page JSON).
4. Compare to this study:
   - If any **>1 FRAME ERROR** on mid-GOP or random seeks (10 / 2 / 25 / 5 / 18 / 1) → HTML is not a replacement (revisit PATH C).
   - If HTML stays ≤1 frame **and** average seek is tens of ms (rvfc actually presents) → HTML may be practical after a small present-wait fix (PATH B candidate).
   - If HTML ≤1 frame but still ~250 ms/seek → HTML is correct-ish but not practical for long-form export.
5. Optional: same project, default export (Mediabunny) vs a **local-only** `setFrameSourceBackend("htmlvideo")` debug build. Do **not** land that default on `main`.
6. Evidence required for HUMAN-PROVEN: Task Manager + in-app Export Fertig + the harness totals (not a screenshot of this Linux Chrome run).

## Replacement Complexity

PATH C (own demux + `VideoDecoder`) is **not** indicated by Chrome 148 evidence. Reserved only if Windows WebView2 later shows GOP-scale errors.

If that happens, minimum architecture (design only, **not built**):

```
MP4 file → ISO-BMFF parse → video trak → sample table → keyframe table
  → DTS/PTS (+ ctts if present) → AVCC length-prefixed VCL + avcC SPS/PPS
  → WebCodecs VideoDecoder → VideoFrame → Canvas
```

Boxes the first-party **muxer already writes** (`mp4.ts`): `ftyp`, `moov`, `mvhd`, `trak`, `tkhd`, `mdia`, `mdhd`, `hdlr`, `minf`, `vmhd`/`smhd`, `dinf`, `dref`, `url `, `stbl`, `stsd`, `avc1`, `avcC`, `stts`, `stsc`, `stsz`, `stco`, `stss`, `mdat`.

Boxes a **demuxer must also handle** on real user files (verified as typical ISO-BMFF, not a wish list): `moof`/`mdat` fragments, `co64` (64-bit offsets), `ctts` (B-frame PTS), `elst` / `edts`, multiple chunks (`stsc` > 1), `hdlr` other than `vide`, HEVC/`hvc1` (out of scope if we stay AVC). Our muxer does **not** write `ctts` (output is `bf=0`-style). **Mux and demux are not symmetric.** Reuse from `mp4.ts`: fourcc/box size conventions, `avcC` layout, timescale thinking. Do **not** assume single-chunk `stco` or “samples in encode order = present order.”

Building that is a new subsystem. It is not a small fallback tweak.

## License/SBOM Impact

**If Mediabunny were eventually removed** (not done here):

| Question | Answer |
| --- | --- |
| Direct npm MPL removed | **YES** (mediabunny 1.55.3) |
| Other npm MPL remain | None known in the current direct/runtime set |
| Rust / Tauri MPL remain | **YES** — `cssparser` 0.36.0, `cssparser-macros` 0.6.1, `dtoa-short` 0.3.5, `selectors` 0.36.1, `option-ext` 0.2.0 (inventory: `docs/compliance/LICENSE-INVENTORY.md`) |
| MPL FREE? | **NO** — Rust MPL crates remain; not independently proven absent from the Windows EXE |
| Expected SBOM delta | Drop npm component `mediabunny@1.55.3` and its declared deps (`@types/dom-webcodecs`, `@types/dom-mediacapture-transform`). Do **not** regenerate final SBOMs in this spike. |
| THIRD_PARTY_NOTICES | **Not created** (still). A future notice would drop the mediabunny MPL paragraph only. |

## Decision

**PATH D — KEEP MEDIABUNNY FOR NOW.**

Not PATH A: HTML is not exact against the current production decoder (40/840 within 1 frame) and is not practical in this environment (250 ms/seek).

Not PATH B as an action to remove: HTML looks **fundamentally close** on Chrome 148 (no GOP snap, 0 errors >1 frame, random seeks exact), and a smaller present-wait / ±1 nudge *might* be enough **after** Windows proof. That is a future candidate, not a removal now.

Not PATH C: Chrome 148 did **not** show frame-accurate seeking to be unreliable with HTMLVideo. An owned demuxer would be disproportionate on this evidence.

PATH D because:

1. Shipping correctness is Windows WebView2. This pass is Linux Chrome 148. Unverified host ≠ resolved.
2. Current Mediabunny path is 840/840 EXACT and ~70× faster here. Replacing it with a 250 ms/frame fallback would be a production regression even if frames were exact.
3. 40 off-by-one frames vs today’s backend is a real export-identity gap at 24–60 fps (16–42 ms). Resonance chose Mediabunny to avoid that class of error.
4. Removing now would be an SBOM/MPL move, which this study forbids as the deciding reason.

**STOP.** Do not delete the dependency. Do not merge the HTML default. Do not start a demuxer. Next evidence, if any: the Windows human plan above.

## Evidence

| Artifact | What it is |
| --- | --- |
| `docs/compliance/mbr-evidence-summary.json` | Totals, performance, random seeks, semantics paints, all 40 non-exact rows |
| `docs/compliance/mbr-evidence.json` | Full 840-row A/B log from Chrome 148 |
| `tests/fixtures/mbr/` | Generated identity MP4s + `manifest.json` |
| `scripts/mbr-frame-harness.html` | Browser A/B harness (dev-only, not in `dist/`) |
| `scripts/mbr-run-chrome.mjs` | Headless runner |
| `src/core/exporter/frame-source.ts` | Switch + Mediabunny open |
| MODE A this pass | `npx tsc --noEmit` exit 0; targeted **105 tests passed in 9 files**; full suite **921 tests passed in 104 files** (vitest 3.2.7); `npm run build` vite 7.3.6, 197 modules, version 5.0.0 |

```
INITIAL MAIN SHA: a922c6eb77cb68494fbde9bd222a16b46ad00b32
MEDIABUNNY VERSION: 1.55.3
MEDIABUNNY IMPORT LOCATIONS: src/core/exporter/frame-source.ts (only src import); package.json; package-lock.json; docs/compliance/LICENSE-INVENTORY.md; docs/compliance/sbom-npm.cdx.json; docs/compliance/SBOM.md; V5-EVIDENCE.md
HTMLVIDEO-ONLY SPIKE: setFrameSourceBackend("htmlvideo") / getDecoder()→null / existing paintHtmlVideo
TYPECHECK: npx tsc --noEmit exit 0
TARGETED TESTS: 105 tests passed in 9 files
FULL SUITE: 921 tests passed in 104 files
BUILD: vite 7.3.6, 197 modules, version 5.0.0
FRAME TESTS: 840 compared (Chrome 148 headless)
EXACT: A 840 / B 800
WITHIN 1 FRAME: A 0 / B 40
OVER 1 FRAME: A 0 / B 0
FAILED: A 0 / B 0
RANDOM SEEK RESULT: 6/6 EXACT on both backends (10s, 2s, 25s, 5s, 18s, 1s)
PERFORMANCE A: 3.02 s total, 3.59 ms avg, 33.1 ms worst
PERFORMANCE B: 210.0 s total, 250.00 ms avg, 276.6 ms worst
WINDOWS WEBVIEW2 VERIFIED: NO
WINDOWS HUMAN TEST REQUIRED: YES
DECISION: PATH D
RATIONALE: Chrome 148 shows HTML ≤1 frame and no GOP snap, but Mediabunny remains exact and ~70× faster here; WebView2 unverified; removal now would trade proven export identity for an unproven host and a slower fallback.
PRODUCTION CODE CHANGED ON MAIN: NO
MEDIABUNNY REMOVED: NO
PACKAGE LOCK CHANGED ON MAIN: NO
SBOM FINALIZED: NO
LICENSE CHANGED: NO
```
