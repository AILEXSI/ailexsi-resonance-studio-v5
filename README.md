# AILEXSI Resonance Studio V5

Version **5.0.0**. Stand 2026-09-13. Ein-Blick-Tabelle: `CURRENT.md`.

Quelle der Wahrheit für diesen Stand: Branch `cursor/remove-wav-move-help-0258` (PR #5). Base enthält Menu-polish aus PR #4. `main` bleibt `314deff` (Stamp nach PR #3). Kein Force-Push auf `main`.

Live-UI (Human-approved, Vite `127.0.0.1:1421`, 2026-09-13):

![AILEXSI Resonance Studio V5 — File \| Import \| Export \| ARRANGE \| CUTTER; transport holds Split Undo Redo Snap Help](docs/ui-2026-09-13.png)

## Start

Dev (Browser oder Tauri-WebView, Port 1421):

```
npm run web:dev
```

oder

```
npx tauri dev
```

(`web:dev` bindet `127.0.0.1:1421`. `npx tauri dev` startet dasselbe via `beforeDevCommand`. `npm run dev` startet Vite ohne festen Host/Port.)

Standalone (Human baut lokal):

```
npm run tauri:exe
```

Kopiert die Release-Exe nach Repo-Root: `AILEXSI Resonance Studio V5.exe`.
Zusätzlich: `src-tauri\\target\\release\\`.

## Top bar

`File | Import | Export | [ARRANGE] | [CUTTER]`

- **File** — öffnet/schließt das Projekt-Overlay.
- **Import** — lokaler Media-Dialog (Video/Musik/Bilder). Einziger Datei-Eingang in der Leiste.
- **Export** — öffnet den H.264-MP4-Export-Dialog. Kein zweiter Encoder-Button.
- **[ARRANGE] / [CUTTER]** — Production-Screens. Kein Reload, kein Projekt-Reset.
- **Nicht oben:** Export WAV, Help, Undo, Redo, Split, Snap. Media-Button bleibt weg.

## Transport

`Play | Pause | Stop | … | Split | Undo | Redo | Snap | Help`

Help (`?`) sitzt auf der Play-Zeile, nicht in der Top bar.

## File overlay

`New | Speichern | Speichern unter | Öffnen | Zuletzt`

- **Kein** Ordner wählen. **Kein** Revert. **Keine** MEDIA-Durchsuchen-Zeile.
- Media-Bin im Overlay (Suche/Filter/Place/Relink) lädt keine Dateien — das macht **Import**.
- **Speichern unter:** Chrome `showSaveFilePicker` (Ordner + Name). Tauri/Exe: nativer Save-Dialog (Ordner + Name, immer Picker). Firefox ohne FSA: Download.

## Limits (ehrlich)

- **AUTO:** Video zuerst, VIS nur in der Lücke. Die AUTO-Zeile in `src/core/transition.ts` nicht anfassen.
- **Export:** H.264 MP4 über den Export-Dialog. AAC nur wenn Probe + Mix + Encode klappen; sonst `audio=none` plus Grund. WebM ist nie Erfolg. Dedicated **Export WAV**-Button ist entfernt. `startExport("wav")` bleibt intern erreichbar, hat aber keinen Toolbar-/Dialog-Weg.
- **Persistenz:** Exe merkt den letzten Projekt**pfad** (`last-project.json` in AppData). Save/Open in der Exe über Tauri-Dialog. Browser: Chrome File System Access; Firefox fällt auf Download zurück. Medien: Exe-IDB-Blob, sonst Datei unter `sourcePath`, sonst missing + Relink. Altes JSON ohne `sourcePath` braucht einmal Relink, dann Save.
- Chrome-Origin ≠ Exe-Origin. Ein im Browser gespeichertes Projekt erscheint **nicht** von allein in der Exe.
- Visualizer: viele Canvas-2D- und projizierte-3D-Modi. Features aus dem Mix, wenn ein Buffer da ist — kein Metronom-Märchen.
- Kein Verkaufsprodukt. COMPLETE: NO.

## Fuer Bots

Basis: PR #5 auf `cursor/remove-wav-move-help-0258`, Menu-polish PR #4 darunter, Version 5.0.0.
Kein Force-Push auf `main`. AUTO-Zeile nicht ändern. Export-Encoder nicht anfassen.
Chrome dieser Revision: Top bar ohne WAV/Help/Undo/Redo/Split/Snap; Help auf Transport.
Nächster Slice: Exe zu/auf nach Relink+Save (keine missing-Parade), dann nächste Produktkante.
