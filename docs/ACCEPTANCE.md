# V5 acceptance + verification paths

Source of truth for the one-look table: `CURRENT.md`. This file is the MODE A / MODE B contract and the 2026-09-13 MODE B EXE record.

Evidence vocabulary: **IMPLEMENTED** | **AUTOMATED-TESTED** | **HUMAN-PROVEN** | **PLANNED** | **NOT IMPLEMENTED**.

Do not mark **HUMAN-PROVEN** from tests, agent screenshots, Vite/Chrome, or `tauri dev` alone.

## MODE A — FAST / HUMAN ITERATION

Use for chrome, layout, and code iteration.

| | |
| --- | --- |
| How | `npm run web:dev` or `npx tauri dev` → `127.0.0.1:1421` |
| Who | Agent or operator, short loops |
| Evidence | DOM, vitest, tsc, vite build, optional Chrome screenshot (`docs/ui-2026-09-13.png` is this class) |
| May claim | IMPLEMENTED, AUTOMATED-TESTED |
| Must not claim | HUMAN-PROVEN |

## MODE B — PRECISION / ACCEPTANCE

Use for operator sign-off of a named SHA.

| | |
| --- | --- |
| How | `npm run tauri:exe` → repo-root `AILEXSI Resonance Studio V5.exe` (also `src-tauri\target\release\`) |
| Who | Human operator on Windows |
| Build from | A **named SHA**, not “whatever is on the docs branch after a stamp” |
| Evidence | Task Manager shows the V5 process; in-app Export **Fertig**; status `Exported … bytes`; toolbar chip **5.0.0**; operator list of exercised flows |
| May claim | HUMAN-PROVEN **only** for the operator’s explicit list |

## 2026-09-13 MODE B EXE (operator PASS)

| | |
| --- | --- |
| Result | **PASSED** |
| EXE SHA | `234a7810a569f741ab2c9f4dd680ed21efae8320` |
| Branch | `cursor/stack-export-vn-1787` (PR #15 onto `cursor/tauri-save-remember-1729` / PR #14) |
| Version | 5.0.0 (package / tauri / Cargo / chip). JSON schema 5. |
| Screenshot | Operator: Task Manager + Export Fertig `Untitled_Resonance.v1.mp4` + status `Exported … bytes` + chip 5.0.0 + dynamic tracks/mixer visible — `docs/exe-acceptance-2026-09-13.png` |

HUMAN-PROVEN in this EXE (do not downgrade):

- app startup / runtime
- Arrange workflow
- dynamic audio-track create / remove
- audio-track vertical scrolling
- dynamic mixer channels
- mixer horizontal scrolling
- mixer resizing / workspace divider
- track / mixer state interaction
- project Speichern / Speichern unter
- automatic project `.vN` filename versioning
- automatic Export `.vN` filename versioning
- actual MP4 export completed successfully
- existing playback / timeline behavior remained functional
- **E Stem Import** (multi-WAV / ZIP, same start) — operator correction: HUMAN-PROVEN

F is **not** in the `234a781` EXE (that SHA predates F). Operator MODE B on PR **#17** feature tip `c4391cbf74edefcd5d37ba5e77af05ff91e58c43`: **F HUMAN-PROVEN** — groups create / assign / collapse / rename. This docs stamp is not the F EXE SHA.

Not in the HUMAN-PROVEN list (still PLANNED / NOT IMPLEMENTED unless noted):

- G–N production-pass items
- zettel: Preview Zoom; audio channel strip EQ / FX; Track / Mixer Channel Rename; Track Color; Distribute Colors (see `CURRENT.md` Future UI — not next slice)

`origin/main` was not this EXE. Main tip at audit time: `9ceb9bd` (docs stamp of `0cdcadf`). Last feature merge on main: PR #9 `c0392f0`.

## Build / test (MODE A, last measured on the accepted EXE SHA)

Measured on `234a781` (PR #15), not on a later docs commit:

```
./node_modules/.bin/tsc --noEmit  → exit 0
npm test                          → 94 files, 831 passed (vitest 3.2.7)
npm run build                     → vite 7.3.6, 193 modules, version 5.0.0
```

F branch (MODE A, this pass): tsc exit 0; vitest **841 passed / 96 files**; vite 7.3.6, 194 modules, version 5.0.0.

Targeted suites for the stacked slices: `tests/core/audio-tracks.test.ts`, `tests/core/track-groups.test.ts`, `tests/layout/dynamic-audio-lanes.test.tsx`, `tests/layout/mixer-resize.test.tsx`, `tests/layout/track-groups.test.tsx`, `tests/media/stem-import.test.ts`, `tests/media/zip-audio.test.ts`, persistence last-project / project-file (Speichern vs Speichern unter + `lastPath`), filename-version / export-name `.vN`.
