# V5 tests

Vitest under `tests/`. Last full count on the accepted EXE SHA `234a781` (PR #15): **831 passed / 94 files** (vitest 3.2.7). Docs-only commits should not change that.

Suites by area:

- foundation / models
- media (import, still, user-fixtures, **stem-import**, **zip-audio**)
- timeline (edit, zoom, markers, clip preview)
- persistence (project-file, last-project, Speichern vs Speichern unter + Tauri `lastPath`)
- preview / playback
- export (dialog, destination, aac-mux, filename-version / export-name `.vN`)
- visualizer
- mixer / volume
- layout (**dynamic-audio-lanes**, **mixer-resize**, **track-groups**)
- core (**audio-tracks**, **track-groups**)
- app (commands, keys, close-gap, ripple, duplicate, relink)

MODE A: `npm test` / `npx tsc --noEmit`. MODE B HUMAN-PROVEN is operator EXE only — see `docs/ACCEPTANCE.md`.
