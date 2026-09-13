# Aktueller Stand

Ein Blick. Kein Wunschzettel.

| Feld | Stand |
| --- | --- |
| Datum | 2026-09-13 |
| Ordner | `C:\\Users\\marti\\ResonanceStudio-V5` |
| Version | 5.0.0 |
| main | `314deff` — README-Stamp nach PR #3 (`e14d7af`). Nicht forcieren. |
| Branch | `cursor/remove-wav-move-help-0258` (PR #5) — SHA nach Docs-Commit |
| Base | Menu-polish PR #4 (`cursor/menu-polish-2bc0` @ `6423bd4`) liegt unter diesem Branch |
| Live-UI | Human-approved Vite `127.0.0.1:1421` — `docs/ui-2026-09-13.png` |
| Start Dev | `npm run web:dev` **oder** `npx tauri dev` auf `127.0.0.1:1421` (`beforeDevCommand` = `web:dev`) |
| Start Standalone | `npm run tauri:exe` kopiert nach Repo-Root `AILEXSI Resonance Studio V5.exe`; liegt auch unter `src-tauri\\target\\release\\` |
| Top bar | File \| Import \| Export \| [ARRANGE] \| [CUTTER] — **kein** Export WAV, **kein** Help, **kein** Undo/Redo/Split/Snap oben |
| Transport | Play / Pause / Stop / … + **Split** + **Undo** + **Redo** + **Snap** + **Help** |
| File overlay | New / Speichern / Speichern unter / Öffnen / Zuletzt — **kein** Ordner wählen, **kein** Revert, **keine** MEDIA-Durchsuchen-Zeile. Import bleibt der Toolbar-Button. Media-Bin (Suche/Filter/Place) kann im Overlay sitzen, lädt aber keine Dateien. |
| Speichern unter | Chrome: `showSaveFilePicker` (Ordner + Name). Tauri/Exe: nativer Save-Dialog (Ordner + Name, immer Picker). Firefox: kein FSA → Download. |
| AUTO | Video zuerst, VIS nur in der Lücke (AUTO-Zeile unangetastet) |
| Export | Toolbar **Export** öffnet den H.264-MP4-Dialog. Dedicated **Export WAV**-Button ist weg. `startExport("wav")` existiert intern (Tests/Code), **kein UI-Weg**. |
| Visualizer | viele Canvas-Modi (2D + projiziertes 3D); Features aus dem Mix, wenn Buffer da ist |
| Persistenz | `last-project.json` in AppData (Pfad-String). Exe: Save/Open über Tauri-Dialog. Browser: Chrome FSA; Firefox Download. Medien: Exe-IDB-Blob → sonst `sourcePath` auf Disk → sonst missing + Relink. Altes JSON ohne `sourcePath`: einmal Relink, dann Save. Chrome-Projekte erscheinen **nicht** magisch in der Exe (anderes Origin). |
| Nächster Slice | Docs = UI 2026-09-13. Dann Exe zu/auf nach Relink+Save (keine missing-Parade). |
