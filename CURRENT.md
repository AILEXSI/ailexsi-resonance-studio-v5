# Aktueller Stand

Ein Blick. Kein Wunschzettel.

| Feld | Stand |
| --- | --- |
| Datum | 2026-09-13 |
| Ordner | `C:\\Users\\marti\\ResonanceStudio-V5` |
| Version | 5.0.0 |
| main | `0cdcadf` — tip. PR #9 merge `c0392f0`. Nicht forcieren. |
| Branch | `main` @ `0cdcadf`. Human-verified exe lineage `0df5da1` (silence-gate content on main). |
| Base | `main` nach PR #9. Stack: File/Import/Export chrome, Help/S-track, compact headers, Follow/audio-VIS/Loop, silence gate. |
| Live-UI | Chrome + **local exe Human-verified** @ `0df5da1`. Vite `127.0.0.1:1421` — `docs/ui-2026-09-13.png`. |
| App icon | 愛 — Artwork `docs/ailexsi-app-icon.png` (PR-#5-Icon-Base). Icons nicht anfassen. |
| Start Dev | `npm run web:dev` **oder** `npx tauri dev` auf `127.0.0.1:1421` (`beforeDevCommand` = `web:dev`) |
| Start Standalone | `npm run tauri:exe` kopiert nach Repo-Root `AILEXSI Resonance Studio V5.exe`; liegt auch unter `src-tauri\\target\\release\\` |
| Top bar | File \| Import \| Export \| [ARRANGE] \| [CUTTER] — **kein** Export WAV, **kein** Help, **kein** Undo/Redo/Split/Snap oben |
| Transport | Play / Pause / Stop / … + **Split** + **Undo** + **Redo** + **Snap** + **Help** |
| Follow playhead | **HUMAN-VERIFIED** (Chrome + local exe @ `0df5da1`). Follow ON: Nadel pinnt bei ~65% der sichtbaren Lane, danach scrollt **ein** `scrollMs` (Ruler, VIS, V1/V2, audio collection). Seek paget nur, wenn die Nadel den View verlässt. Follow OFF: kein Auto-Scroll, kein Force-Scroll. |
| Loop | **HUMAN-VERIFIED.** Loop OFF spielt über OUT weiter (OUT = Marker, kein Stop). Loop ON wrappt OUT→IN. |
| Compact headers | Kurze Lanes (`< 46px`): VIS `VIS [M] [Scene]`, V/A `V1 [M] [S]` in einer Zeile. Default ~52px bleibt gestapelt. |
| File overlay | New / Speichern / Speichern unter / Öffnen / Zuletzt — **kein** Ordner wählen, **kein** Revert, **keine** MEDIA-Durchsuchen-Zeile. Import bleibt der Toolbar-Button. Media-Bin (Suche/Filter/Place) kann im Overlay sitzen, lädt aber keine Dateien. |
| Speichern unter | Chrome: `showSaveFilePicker` (Ordner + Name). Tauri/Exe: nativer Save-Dialog (Ordner + Name, immer Picker). Firefox: kein FSA → Download. |
| Help overlay | Scrollbares 2-Spalten-Sheet (`?` / Help). `max-height` Viewport (`dvh`/`vh`), sticky Header, innerer Scroll — passt ins maximierte Fenster. |
| S / Split | Nur **aktive/selektierte** Tracks unter VIS / V1 / V2 / audio collection. Multi-Select OK. Linked Mates auf anderen Tracks werden **nicht** mitgeschnitten. |
| VIS S-cut | **Human-verified.** S teilt VIS-Events / Cues / Window am Playhead, wenn VIS fokussiert ist (Header oder Event). V/A clips remain whole. |
| Dynamic audio | **D TEST-VERIFIED.** Collection, not A1/A2 architecture. Capacity 64, created as needed (`+A` / `−A`). Stable ids; labels A1, A2, A3…. Legacy A1/A2 JSON loads. Lane template reused; `.timeline-lanes` vertical scroll; mixer channels scroll independently. **Live NOT VERIFIED.** |
| VIS click-seek | Klick in die VIS-Lane (leer oder Event-Fill, z.B. Tunnel) setzt den Playhead — gleicher Snap-Seek wie V1/V2/A-Lane-Body. Header/Event-Select blockiert den Seek nicht. Event-Drag unverändert. |
| AUTO | Video zuerst, VIS nur in der Lücke (AUTO-Zeile unangetastet) |
| Export | Toolbar **Export** öffnet den H.264-MP4-Dialog. Dedicated **Export WAV**-Button ist weg. `startExport("wav")` existiert intern (Tests/Code), **kein UI-Weg**. |
| Visualizer | **HUMAN-VERIFIED.** Canvas-Modi unverändert. Geladenes first-audible-audio / Mix-PCM treibt Onset/Energy (Visualz-Step). Default projects still A1-first. Silence gate (`rms < 0.02 && bass < 0.03`): Playhead in audio/Mix-Lücke oder echter Stille → energy/onset/beatPulse ~0, kein Pulse in Audio-Lücken. Kein `featuresAt` 120-BPM-Metronom, solange das Projekt einen Audio-Pfad hat. Beat = audio-derived onset/energy sync — **kein** DAW Beat-Grid-Lock. |
| Persistenz | `last-project.json` in AppData (Pfad-String). Exe: Save/Open über Tauri-Dialog. Browser: Chrome FSA; Firefox Download. Medien: Exe-IDB-Blob → sonst `sourcePath` auf Disk → sonst missing + Relink. Altes JSON ohne `sourcePath`: einmal Relink, dann Save. Chrome-Projekte erscheinen **nicht** magisch in der Exe (anderes Origin). |
| Nächster Slice | Production Pass **E** (Stem Import) — **PLANNED / NOT IMPLEMENTED**. D is TEST-VERIFIED only; Live NOT VERIFIED. |
| Production Pass | **D TEST-VERIFIED / IMPLEMENTED** (code). **E–N PLANNED / NOT IMPLEMENTED**. Four Chapters + bis 11 Suno-Stems × 4. Kein Cubase-Klon. VIS-Ausbau-Intent = K–N. Version 5.0.0. AUTO unangetastet. |

## Production Pass (D implemented · E–N planned)

**D** is in App-Code (test + tsc + vite build). **Live NOT VERIFIED.** E–N remain docs-only. AUTO unangetastet. Version bleibt **5.0.0**.

**Ziel:** vierteiliges Werk + bis 11 Suno-Stems × 4 Kapitel. Kein Cubase-Klon. **01** A Signal in the Dark · **02** The Living Seal · **03** Neverland: The Flight · **04** New Reality: Beyond the Code.

Älterer VIS-Ausbau-Intent ist hier in **K–N** aufgegangen — keine zweite Roadmap.

| ID | Item | Status |
| --- | --- | --- |
| D | Dynamic Audio Tracks — Kapazität ≥64, anlegen nach Bedarf, stabile IDs, A1/A2 rückwärtskompatibel | **IMPLEMENTED / TEST-VERIFIED** · Live NOT VERIFIED |
| E | Stem Import — Multi-WAV Suno-Stems, gleicher Start, Chapter-Gruppe; ZIP optional | **PLANNED / NOT IMPLEMENTED** |
| F | Track/Chapter Groups — Collapse nur UI, kein Group-Bus | **PLANNED / NOT IMPLEMENTED** |
| G | Volume Automation — VOL-Lane, Punkte, linear; Clip-Gain ≠ Static Vol ≠ Automation | **PLANNED / NOT IMPLEMENTED** |
| H | Write Automation **W** — Volume only während Playback | **PLANNED / NOT IMPLEMENTED** |
| I | 44-Track Acceptance — 4×11 | **PLANNED / NOT IMPLEMENTED** |
| J | Four Chapters — echte Produktion: **01** A Signal in the Dark · **02** The Living Seal · **03** Neverland: The Flight · **04** New Reality: Beyond the Code | **PLANNED / NOT IMPLEMENTED** |
| K | VIS Library — bestehende Szenen = feste **BASICS**-Gruppe; Klassifikation `basics` \| `audioReactive` | **PLANNED / NOT IMPLEMENTED** |
| L | Shared Modulation Bus — nur bestehende Features (Energy/Bass/Onset …); kein zweites Metronom | **PLANNED / NOT IMPLEMENTED** |
| M | Audio Reactive v1 — Image/Video: Bass→Scale, Energy→Exposure, Onset→Glow | **PLANNED / NOT IMPLEMENTED** |
| N | Späterer Ausbau nur aus nachgewiesenem Bedarf (Four Chapters) | **PLANNED / NOT IMPLEMENTED** |
