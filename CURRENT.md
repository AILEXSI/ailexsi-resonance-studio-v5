# Aktueller Stand

Ein Blick. Kein Wunschzettel.

Evidence: **IMPLEMENTED** | **AUTOMATED-TESTED** | **HUMAN-PROVEN** | **PLANNED** | **NOT IMPLEMENTED**.
**HUMAN-PROVEN** only from MODE B operator EXE acceptance — not from tests, agent screenshots, or Chrome-only runs.

| Feld | Stand |
| --- | --- |
| Datum | 2026-09-13 |
| Ordner | `C:\\Users\\marti\\ResonanceStudio-V5` |
| Version | **5.0.0** (package / tauri / Cargo / toolbar chip). JSON `schemaVersion` **5**. |
| main | `origin/main` @ `9ceb9bd` (docs stamp of `0cdcadf`). Last feature merge on main: PR #9 `c0392f0`. **Stack not merged to main.** |
| Lineage | Accepted local EXE built from PR **#15** tip `234a7810a569f741ab2c9f4dd680ed21efae8320` (`cursor/stack-export-vn-1787` → PR #14 `cursor/tauri-save-remember-1729`). Contains D + D.1 mixer + E + Speichern `lastPath` + Export/Speichern-unter `.vN`. Open PR chain **#10–#15**; later heads supersede earlier D/E/export-only PRs. Docs-only commits on this branch sit on that tip — they are not the EXE SHA. |
| Base | `main` after PR #9, plus unmerged stack D→D.1→E→Speichern→Export `.vN`. |
| Live-UI | Chrome chrome still `docs/ui-2026-09-13.png` (Vite `127.0.0.1:1421`, MODE A). **EXE HUMAN-PROVEN** 2026-09-13: `docs/exe-acceptance-2026-09-13.png` (Task Manager + Export Fertig). See `docs/ACCEPTANCE.md`. |
| App icon | 愛 — Tauri icons in `src-tauri/icons/` (PR-#5-Icon-Base). `docs/ailexsi-app-icon.png` is referenced historically and is **not** in this tree. Icons nicht anfassen. |
| Start Dev | MODE A: `npm run web:dev` **oder** `npx tauri dev` auf `127.0.0.1:1421` (`beforeDevCommand` = `web:dev`) |
| Start Standalone | MODE B: `npm run tauri:exe` kopiert nach Repo-Root `AILEXSI Resonance Studio V5.exe`; liegt auch unter `src-tauri\\target\\release\\` |
| Top bar | File \| Import \| Export \| [ARRANGE] \| [CUTTER] — **kein** Export WAV, **kein** Help, **kein** Undo/Redo/Split/Snap oben |
| Transport | Play / Pause / Stop / … + **Split** + **Undo** + **Redo** + **Snap** + **Help** |
| Follow playhead | **HUMAN-PROVEN** (earlier Chrome + local exe @ `0df5da1` on main). Follow ON: Nadel pinnt bei ~65% der sichtbaren Lane, danach scrollt **ein** `scrollMs` (Ruler, VIS, V1/V2, audio collection). Seek paget nur, wenn die Nadel den View verlässt. Follow OFF: kein Auto-Scroll, kein Force-Scroll. This EXE pass: existing playback / timeline remained functional. |
| Loop | **HUMAN-PROVEN** (earlier). Loop OFF spielt über OUT weiter (OUT = Marker, kein Stop). Loop ON wrappt OUT→IN. |
| Compact headers | Kurze Lanes (`< 46px`): VIS `VIS [M] [Scene]`, V/A `V1 [M] [S]` in einer Zeile. Default ~52px bleibt gestapelt. |
| File overlay | New / Speichern / Speichern unter / Öffnen / Zuletzt — **kein** Ordner wählen, **kein** Revert, **keine** MEDIA-Durchsuchen-Zeile. Import bleibt der Toolbar-Button. Media-Bin (Suche/Filter/Place) kann im Overlay sitzen, lädt aber keine Dateien. |
| Speichern / Speichern unter | **HUMAN-PROVEN** in EXE. **Speichern:** Tauri schreibt gemerkten `lastPath` ohne Picker; ohne Pfad öffnet den nativen Save-Dialog. **Speichern unter:** immer Picker, `defaultPath` versioniert (`Stem.vN.resonance.json`, nie Windows `(2)`). Panel zeigt Dateiname + Elternordner (oder `Pfad gemerkt`) sobald `lastPath` da ist. Chrome: `showSaveFilePicker` / FSA. Firefox: kein FSA → Download. |
| Project `.vN` | **HUMAN-PROVEN.** Suggested name `Untitled_Resonance.v1.resonance.json` (leer → `.v1`; unversioniert belegt v1 → `.v2`). Shared helpers with Export (`filename-version.ts`). |
| Help overlay | Scrollbares 2-Spalten-Sheet (`?` / Help). `max-height` Viewport (`dvh`/`vh`), sticky Header, innerer Scroll — passt ins maximierte Fenster. |
| S / Split | Nur **aktive/selektierte** Tracks unter VIS / V1 / V2 / audio collection (not A1/A2-only). Multi-Select OK. Linked Mates auf anderen Tracks werden **nicht** mitgeschnitten. |
| VIS S-cut | **HUMAN-PROVEN** (earlier). S teilt VIS-Events / Cues / Window am Playhead, wenn VIS fokussiert ist. V/A clips remain whole. |
| Dynamic audio | **D HUMAN-PROVEN in EXE.** Collection, not A1/A2 architecture. Default project still A1+A2 (`MIN_AUDIO_TRACKS` 2). Capacity **64** (`MAX_AUDIO_TRACKS`). Created as needed. Circular `+`/`−` on the **last** audio header (`−` hidden at floor 2, `+` disabled at 64). Stable ids (`A1`/`A2` legacy; new `a_*`); labels A1, A2, A3…. Legacy A1/A2 JSON loads. Lane template reused. `.timeline-lanes` **vertical** scroll. Mixer channels follow the collection; **horizontal** mixer scroll. Resizable mixer / workspace divider. Track/mixer state stays in sync. |
| Stem import | **E IMPLEMENTED / AUTOMATED-TESTED.** Not in this EXE HUMAN-PROVEN list — do not invent HUMAN-PROVEN. Import picker is multi-select (browser + Tauri). Two or more audio files in one action → each file one MediaAsset + one audio track (empty lanes first, then `addAudioTrack`). Clips share one start (playhead if >0 / snap, else 0). Labels from filename (extension stripped). Status reports cap skips (`audio track limit 64`). ZIP of WAVs expands in-memory (store + deflate, no new deps). Single-file Import still appends. **No F group collapse.** Optional `groupId` only when filenames share a prefix. Remaining E/F intent: Suno naming normalize, single-vs-multi placement polish — **PLANNED**. |
| VIS click-seek | Klick in die VIS-Lane (leer oder Event-Fill) setzt den Playhead — gleicher Snap-Seek wie V1/V2/A-Lane-Body. |
| AUTO | Video zuerst, VIS nur in der Lücke (AUTO-Zeile unangetastet) |
| Export | **HUMAN-PROVEN** in EXE. Toolbar **Export** → H.264-MP4-Dialog. Default-Name immer `Stem.vN.ext` (screenshot: `Untitled_Resonance.v1.mp4` / status `Exported … bytes`). Empty folder → `.v1`; unversioned sibling occupies v1 → `.v2`. Dedicated **Export WAV**-Button ist weg. `startExport("wav")` existiert intern (Tests/Code), **kein UI-Weg**. |
| Visualizer | **HUMAN-PROVEN** (earlier). Canvas-Modi unverändert. Geladenes first-audible-audio / Mix-PCM treibt Onset/Energy. Silence gate (`rms < 0.02 && bass < 0.03`). Beat = audio-derived onset/energy — **kein** DAW Beat-Grid-Lock. |
| Persistenz | `last-project.json` in AppData (Pfad-String). Exe: Save/Open über Tauri-Dialog; nach Speichern/Öffnen merkt das File-Panel den Pfad. Browser: Chrome FSA; Firefox Download. Medien: Exe-IDB-Blob → sonst `sourcePath` auf Disk → sonst missing + Relink. Chrome-Projekte erscheinen **nicht** magisch in der Exe. JSON `schemaVersion` **5**. App/Tauri/Cargo **5.0.0**. |
| Nächster Slice | Production Pass **F** (Track/Chapter Groups UI collapse) — **PLANNED / NOT IMPLEMENTED**. E remains IMPLEMENTED / AUTOMATED-TESTED only. STOP — no F+ in this docs pass. |
| Production Pass | **D HUMAN-PROVEN** (incl. mixer resize/scroll). **E IMPLEMENTED / AUTOMATED-TESTED**. **F–N + zettel PLANNED / NOT IMPLEMENTED**. Four Chapters + bis 11 Suno-Stems × 4. Kein Cubase-Klon. VIS-Ausbau-Intent = K–N. Version 5.0.0. AUTO unangetastet. |

## Verification paths

| Mode | Name | What it is | What it may claim |
| --- | --- | --- | --- |
| **A** | **FAST / HUMAN ITERATION** | Vite `npm run web:dev` or `npx tauri dev` on `127.0.0.1:1421`. Agent/Chrome screenshots, layout iteration, automated tests. | **IMPLEMENTED** / **AUTOMATED-TESTED**. Never **HUMAN-PROVEN**. |
| **B** | **PRECISION / ACCEPTANCE** | Local standalone EXE (`npm run tauri:exe`) built from a **named SHA**. Operator drives Arrange / File / Export on Windows. Evidence: Task Manager process + in-app Export **Fertig** + status `Exported … bytes` + version chip 5.0.0. | Only the operator’s explicit EXE list is **HUMAN-PROVEN**. |

This 2026-09-13 pass is **MODE B**. Screenshot: Task Manager `AILEXSI Resonance Studio V5` + Export Fertig `Untitled_Resonance.v1.mp4` + status `Exported … bytes` + chip **5.0.0** + dynamic tracks/mixer visible. Details: `docs/ACCEPTANCE.md`.

## Production Pass (D HUMAN-PROVEN · E code present · F–N planned)

**D** is in App-Code and **HUMAN-PROVEN** in the accepted EXE (dynamic lanes + mixer resize/scroll/sync). **E** is in App-Code and **AUTOMATED-TESTED**; human list did **not** cover multi-WAV/ZIP stem import. F–N remain docs-only. AUTO unangetastet. Version bleibt **5.0.0**.

**Ziel:** vierteiliges Werk + bis 11 Suno-Stems × 4 Kapitel. Kein Cubase-Klon. **01** A Signal in the Dark · **02** The Living Seal · **03** Neverland: The Flight · **04** New Reality: Beyond the Code.

Älterer VIS-Ausbau-Intent ist hier in **K–N** aufgegangen — keine zweite Roadmap.

| ID | Item | Status |
| --- | --- | --- |
| D | Dynamic Audio Tracks — Kapazität 64, anlegen nach Bedarf, stabile IDs, A1/A2 rückwärtskompatibel; last-lane `+/−`; vertical lane scroll; mixer follows collection; horizontal mixer scroll; resizable mixer / workspace divider; track↔mixer sync | **IMPLEMENTED / AUTOMATED-TESTED / HUMAN-PROVEN** (EXE) |
| E | Stem Import — Multi-WAV Suno-Stems, gleicher Start, ZIP in-memory; Chapter `groupId` prefix-only (no collapse UI) | **IMPLEMENTED / AUTOMATED-TESTED** · not HUMAN-PROVEN this pass |
| E+ | E refinements: Suno filename normalize; single-vs-multi placement polish (code already: 2+ same start / 1 appends) | **PLANNED** (do not implement here) |
| F | Track/Chapter Groups — Collapse nur UI, kein Group-Bus | **PLANNED / NOT IMPLEMENTED** |
| G | Volume Automation — VOL-Lane, Punkte, linear; Clip-Gain ≠ Static Vol ≠ Automation | **PLANNED / NOT IMPLEMENTED** |
| H | Write Automation **W** — Volume only während Playback | **PLANNED / NOT IMPLEMENTED** |
| I | 44-Track Acceptance — 4×11 | **PLANNED / NOT IMPLEMENTED** |
| J | Four Chapters — echte Produktion: **01** A Signal in the Dark · **02** The Living Seal · **03** Neverland: The Flight · **04** New Reality: Beyond the Code | **PLANNED / NOT IMPLEMENTED** |
| K | VIS Library — bestehende Szenen = feste **BASICS**-Gruppe; Klassifikation `basics` \| `audioReactive` | **PLANNED / NOT IMPLEMENTED** |
| L | Shared Modulation Bus — nur bestehende Features (Energy/Bass/Onset …); kein zweites Metronom | **PLANNED / NOT IMPLEMENTED** |
| M | Audio Reactive v1 — Image/Video: Bass→Scale, Energy→Exposure, Onset→Glow | **PLANNED / NOT IMPLEMENTED** |
| N | Späterer Ausbau nur aus nachgewiesenem Bedarf (Four Chapters) | **PLANNED / NOT IMPLEMENTED** |
| Zettel | Preview Zoom (preview pane, not timeline zoom) | **PLANNED / NOT IMPLEMENTED** |
| Zettel | Audio channel strip EQ / FX (mixer is volume / pan / mute / solo only) | **PLANNED / NOT IMPLEMENTED** |
