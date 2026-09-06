# AILEXSI Resonance Studio V5

Version **5.0.0**. Stand 2026-09-06. Ein-Blick-Tabelle: `CURRENT.md`.

Branch: `cursor/visualz-scenes-7f5e`. `main` hat diesen Stand **noch nicht** (PR #3 offen). Nicht auf `main` weiterbauen, bis Human mergen lässt.

## Start

Dev (WebView2 oder Browser, Port 1421):

```
npm run tauri:dev
```

oder

```
npm run web:dev
```

(`npm run dev` startet Vite ohne festen Host/Port — für 1421 `web:dev` nutzen.)

Standalone (Human baut lokal):

```
npm run tauri:exe
```

Kopiert die Release-Exe nach Repo-Root: `AILEXSI Resonance Studio V5.exe`.
Zusätzlich: `src-tauri\target\release\`.

## Toolbar

`File | Import | Export | Export WAV | Screens | Edit`

- **File** — ein Button, öffnet/schließt ProjectFilePanel (Projekt + Media-Browser). New/Save/Open/Zuletzt/Revert nur im Panel.
- **Import** — lokaler Media-Dialog (Video/Musik laden).
- **Media-Button** — weg. Kein zweiter Eingang in der Leiste.

## Limits (ehrlich)

- **AUTO:** Video zuerst, VIS nur in der Lücke. Die AUTO-Zeile in `src/core/transition.ts` nicht anfassen.
- **Export:** H.264 MP4. AAC nur wenn Probe + Mix + Encode klappen; sonst `audio=none` plus Grund. WebM ist nie Erfolg.
- **Persistenz:** Exe merkt den letzten Projekt**pfad** (`last-project.json` in AppData). Save/Open in der Exe über Tauri-Dialog. Browser: Chrome File System Access. Medien: Exe-IDB-Blob, sonst Datei unter `sourcePath`, sonst missing + Relink. Altes JSON ohne `sourcePath` braucht einmal Relink, dann Save.
- Chrome-Origin ≠ Exe-Origin. Ein im Browser gespeichertes Projekt erscheint **nicht** von allein in der Exe.
- Visualizer: viele Canvas-2D- und projizierte-3D-Modi. Features aus dem Mix, wenn ein Buffer da ist — kein Metronom-Märchen.
- Kein Verkaufsprodukt. COMPLETE: NO.

## Fuer Bots

Basis: Branch `cursor/visualz-scenes-7f5e`, Version 5.0.0.
Nicht mergen, nicht auf `main` force-pushen, AUTO-Zeile nicht ändern.
Nächster Slice: Solo-Exe-Preview beim Human; mergen nur wenn Human sagt. `icon.ico` liegt im Repo.
Last-path, sourcePath, File-Button, Media-weg: **fertig**, nicht als „next“ listen.
