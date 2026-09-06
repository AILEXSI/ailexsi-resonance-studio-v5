# Aktueller Stand

Datum: 2026-09-06

| Frage | Antwort |
| --- | --- |
| Ordner | `C:\\Users\\marti\\ResonanceStudio-V5` |
| Branch lokal | `pr-1` |
| Branch GitHub | `cursor/visualz-scenes-7f5e` |
| `main` | alt (`b4d2d81`), nicht bauen |
| Version | 5.0.0 |
| Start | Exe im Repo-Root nach `npm run tauri:exe` (`AILEXSI Resonance Studio V5.exe`) |
| File | Ein Button öffnet/schließt das Projekt-Panel; New/Open/Save nur im Panel |
| Persistenz | `last-project.json` (path, kein FileHandle); Import/Relink in der Exe setzt `sourcePath` |
| Standalone = Tauri-Exe? | Ja, nach `npm run tauri:exe` (Human baut lokal). |
| Export | MP4 mit Bild und Ton (H.264 + AAC), am Rechner geprueft |
| Visualizer | viele Modi + Cues, nicht nur Bars/Orb |
| Zwei UIs? | Nein. Tab und App-Fenster = gleiche App, ggf. anderes Projekt im Fenster |
| Naechster Slice | Features aus der Musik (nicht Metronom), auf diesem Branch |
