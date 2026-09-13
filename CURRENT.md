# Aktueller Stand

Ein Blick. Kein Wunschzettel.

| Feld | Stand |
| --- | --- |
| Datum | 2026-09-13 |
| Ordner | `C:\\Users\\marti\\ResonanceStudio-V5` |
| Version | 5.0.0 |
| main | `314deff` — README-Stamp nach PR #3 (`e14d7af`). Nicht forcieren. |
| Branch | `cursor/vis-silence-gate-d1d3` @ `3d4e7dc` (stacked on PR #8 `cursor/transport-follow-audio-loop-44f8` @ `05ffa9c`) |
| Base | PR #8 transport/Follow/Loop (`05ffa9c`). Darunter PR #7 compact-headers, PR #6 Help/S-track. |
| Live-UI | Chrome Human-approved Vite `127.0.0.1:1421` — `docs/ui-2026-09-13.png`. VIS-S-Cut **Human-verified** auf diesem Branch. |
| App icon | 愛 — Artwork `docs/ailexsi-app-icon.png` (PR-#5-Icon-Base). Diese PR fasst Icons nicht an. |
| Start Dev | `npm run web:dev` **oder** `npx tauri dev` auf `127.0.0.1:1421` (`beforeDevCommand` = `web:dev`) |
| Start Standalone | `npm run tauri:exe` kopiert nach Repo-Root `AILEXSI Resonance Studio V5.exe`; liegt auch unter `src-tauri\\target\\release\\` |
| Top bar | File \| Import \| Export \| [ARRANGE] \| [CUTTER] — **kein** Export WAV, **kein** Help, **kein** Undo/Redo/Split/Snap oben |
| Transport | Play / Pause / Stop / … + **Split** + **Undo** + **Redo** + **Snap** + **Help** |
| Follow playhead | **TEST-VERIFIED** auf `cursor/transport-follow-audio-loop-44f8`. Transport pinnt bei ~65% und scrollt das eine `scrollMs`. Follow OFF bleibt ohne Auto-Scroll. Live Exe: NOT VERIFIED. |
| File overlay | New / Speichern / Speichern unter / Öffnen / Zuletzt — **kein** Ordner wählen, **kein** Revert, **keine** MEDIA-Durchsuchen-Zeile. Import bleibt der Toolbar-Button. Media-Bin (Suche/Filter/Place) kann im Overlay sitzen, lädt aber keine Dateien. |
| Speichern unter | Chrome: `showSaveFilePicker` (Ordner + Name). Tauri/Exe: nativer Save-Dialog (Ordner + Name, immer Picker). Firefox: kein FSA → Download. |
| Help overlay | Scrollbares 2-Spalten-Sheet (`?` / Help). `max-height` Viewport (`dvh`/`vh`), sticky Header, innerer Scroll — passt ins maximierte Fenster. |
| S / Split | Nur **aktive/selektierte** Tracks unter VIS / V1 / V2 / A1 / A2. Multi-Select OK. Linked Mates auf anderen Tracks werden **nicht** mitgeschnitten. |
| VIS S-cut | **Human-verified.** S teilt VIS-Events / Cues / Window am Playhead, wenn VIS fokussiert ist (Header oder Event). V1–A2-Clips bleiben ganz. |
| VIS click-seek | Klick in die VIS-Lane (leer oder Event-Fill, z.B. Tunnel) setzt den Playhead — gleicher Snap-Seek wie V1/V2/A-Lane-Body. Header/Event-Select blockiert den Seek nicht. Event-Drag unverändert. |
| AUTO | Video zuerst, VIS nur in der Lücke (AUTO-Zeile unangetastet) |
| Export | Toolbar **Export** öffnet den H.264-MP4-Dialog. Dedicated **Export WAV**-Button ist weg. `startExport("wav")` existiert intern (Tests/Code), **kein UI-Weg**. |
| Visualizer | Canvas-Modi unverändert. Geladenes A1/Mix-PCM treibt Onset/Energy (Visualz-Step). Visualz silence-gate (`rms < 0.02 && bass < 0.03`): Playhead in A1/Mix-Lücke oder echter Stille → energy/onset/beatPulse ~0. Kein `featuresAt` 120-BPM-Metronom, solange das Projekt einen Audio-Pfad hat. |
| Persistenz | `last-project.json` in AppData (Pfad-String). Exe: Save/Open über Tauri-Dialog. Browser: Chrome FSA; Firefox Download. Medien: Exe-IDB-Blob → sonst `sourcePath` auf Disk → sonst missing + Relink. Altes JSON ohne `sourcePath`: einmal Relink, dann Save. Chrome-Projekte erscheinen **nicht** magisch in der Exe (anderes Origin). |
| Nächster Slice | Live Exe + Relink+Save nach diesem Transport-Pass. AUTO-Zeile unangetastet. |
