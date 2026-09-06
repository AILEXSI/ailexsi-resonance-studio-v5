# Aktueller Stand

Ein Blick. Kein Wunschzettel.

| Feld | Stand |
| --- | --- |
| Datum | 2026-09-06 |
| Ordner | `C:\\Users\\marti\\ResonanceStudio-V5` |
| Version | 5.0.0 |
| main | `e14d7af` — **PR #3 gemerged** |
| Branch | Arbeit ab jetzt auf `main` |
| Start Dev | `npm run tauri:dev` **oder** `npm run web:dev` auf `127.0.0.1:1421` |
| Start Standalone | `npm run tauri:exe` kopiert nach Repo-Root `AILEXSI Resonance Studio V5.exe`; liegt auch unter `src-tauri\\target\\release\\` |
| Toolbar | File \\| Import \\| Export \\| Export WAV \\| Screens \\| Edit — **Media-Button weg** |
| File | Ein Button → ProjectFilePanel (Projekt + Media-Browser). New/Save/Open/Zuletzt/Revert nur im Panel |
| Import | lokaler Media-Dialog (Toolbar) |
| AUTO | Video zuerst, VIS nur in der Lücke (AUTO-Zeile unangetastet) |
| Export | H.264 MP4; AAC wenn Probe+Mix+Encode klappen, sonst `audio=none` + Grund; WebM zählt nie als Erfolg |
| Visualizer | viele Canvas-Modi (2D + projiziertes 3D); Features aus dem Mix, wenn Buffer da ist |
| Persistenz | `last-project.json` in AppData (Pfad-String); Save/Open in der Exe per Tauri-Dialog; Chrome FSA nur wenn nicht Tauri. Medien: Exe-IDB-Blob → sonst `sourcePath` auf Disk → sonst missing + Relink. Altes JSON ohne `sourcePath`: einmal Relink, dann Save. Chrome-Projekte erscheinen **nicht** magisch in der Exe (anderes Origin). |
| Nächster Slice | Exe zu/auf nach Relink+Save prüfen (keine missing-Parade). Dann nächste Produktkante. |
