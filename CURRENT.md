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
| Stem import | **E HUMAN-PROVEN in EXE.** Import picker is multi-select (browser + Tauri). Two or more audio files in one action → each file one MediaAsset + one audio track (empty lanes first, then `addAudioTrack`). Clips share one start (playhead if >0 / snap, else 0). Labels from filename (extension stripped). Status reports cap skips (`audio track limit 64`). ZIP of WAVs expands in-memory (store + deflate, no new deps). Single-file Import still appends. Optional `groupId` when filenames share a prefix — F maps that into `Project.groups`. Remaining E refinements: Suno naming normalize, single-vs-multi placement polish — **PLANNED**. |
| VIS click-seek | Klick in die VIS-Lane (leer oder Event-Fill) setzt den Playhead — gleicher Snap-Seek wie V1/V2/A-Lane-Body. |
| AUTO | Video zuerst, VIS nur in der Lücke (AUTO-Zeile unangetastet) |
| Export | **HUMAN-PROVEN** in EXE. Toolbar **Export** → H.264-MP4-Dialog. Default-Name immer `Stem.vN.ext` (screenshot: `Untitled_Resonance.v1.mp4` / status `Exported … bytes`). Empty folder → `.v1`; unversioned sibling occupies v1 → `.v2`. Dedicated **Export WAV**-Button ist weg. `startExport("wav")` existiert intern (Tests/Code), **kein UI-Weg**. |
| Visualizer | **HUMAN-PROVEN** (earlier). Canvas-Modi unverändert. Geladenes first-audible-audio / Mix-PCM treibt Onset/Energy. Silence gate (`rms < 0.02 && bass < 0.03`). Beat = audio-derived onset/energy — **kein** DAW Beat-Grid-Lock. |
| Persistenz | `last-project.json` in AppData (Pfad-String). Exe: Save/Open über Tauri-Dialog; nach Speichern/Öffnen merkt das File-Panel den Pfad. Browser: Chrome FSA; Firefox Download. Medien: Exe-IDB-Blob → sonst `sourcePath` auf Disk → sonst missing + Relink. Chrome-Projekte erscheinen **nicht** magisch in der Exe. JSON `schemaVersion` **5**. App/Tauri/Cargo **5.0.0**. |
| Nächster Slice | Production Pass **G** (Volume Automation) — **PLANNED / NOT IMPLEMENTED**. F is IMPLEMENTED / AUTOMATED-TESTED (not HUMAN-PROVEN). Future UI zettel (track rename / color / distribute / Preview Zoom / EQ-FX) is **not** this slice. STOP — no G+. |
| Production Pass | **D HUMAN-PROVEN** (incl. mixer resize/scroll). **E HUMAN-PROVEN** (Stem Import). **F IMPLEMENTED / AUTOMATED-TESTED** (Track/Chapter Groups collapse UI). **G–N + zettel PLANNED / NOT IMPLEMENTED**. Four Chapters + bis 11 Suno-Stems × 4. Kein Cubase-Klon. VIS-Ausbau-Intent = K–N. Version 5.0.0. AUTO unangetastet. |

## Verification paths

| Mode | Name | What it is | What it may claim |
| --- | --- | --- | --- |
| **A** | **FAST / HUMAN ITERATION** | Vite `npm run web:dev` or `npx tauri dev` on `127.0.0.1:1421`. Agent/Chrome screenshots, layout iteration, automated tests. | **IMPLEMENTED** / **AUTOMATED-TESTED**. Never **HUMAN-PROVEN**. |
| **B** | **PRECISION / ACCEPTANCE** | Local standalone EXE (`npm run tauri:exe`) built from a **named SHA**. Operator drives Arrange / File / Export on Windows. Evidence: Task Manager process + in-app Export **Fertig** + status `Exported … bytes` + version chip 5.0.0. | Only the operator’s explicit EXE list is **HUMAN-PROVEN**. |

This 2026-09-13 pass is **MODE B**. Screenshot: Task Manager `AILEXSI Resonance Studio V5` + Export Fertig `Untitled_Resonance.v1.mp4` + status `Exported … bytes` + chip **5.0.0** + dynamic tracks/mixer visible. Details: `docs/ACCEPTANCE.md`.

## Production Pass (D + E HUMAN-PROVEN · F AUTOMATED-TESTED · G–N planned)

**D** is in App-Code and **HUMAN-PROVEN** in the accepted EXE (dynamic lanes + mixer resize/scroll/sync). **E Stem Import** is in App-Code and **HUMAN-PROVEN** in the accepted EXE (operator correction). **F Track/Chapter Groups** is in App-Code and **AUTOMATED-TESTED** (MODE A — not EXE HUMAN-PROVEN). G–N remain docs-only. AUTO unangetastet. Version bleibt **5.0.0**.

**Ziel:** vierteiliges Werk + bis 11 Suno-Stems × 4 Kapitel. Kein Cubase-Klon. **01** A Signal in the Dark · **02** The Living Seal · **03** Neverland: The Flight · **04** New Reality: Beyond the Code.

Älterer VIS-Ausbau-Intent ist hier in **K–N** aufgegangen — keine zweite Roadmap.

| ID | Item | Status |
| --- | --- | --- |
| D | Dynamic Audio Tracks — Kapazität 64, anlegen nach Bedarf, stabile IDs, A1/A2 rückwärtskompatibel; last-lane `+/−`; vertical lane scroll; mixer follows collection; horizontal mixer scroll; resizable mixer / workspace divider; track↔mixer sync | **IMPLEMENTED / AUTOMATED-TESTED / HUMAN-PROVEN** (EXE) |
| E | Stem Import — Multi-WAV Suno-Stems, gleicher Start, ZIP in-memory; Chapter `groupId` prefix maps into F groups | **IMPLEMENTED / AUTOMATED-TESTED / HUMAN-PROVEN** (EXE) |
| E+ | E refinements: Suno filename normalize; single-vs-multi placement polish (code already: 2+ same start / 1 appends) | **PLANNED** (do not implement here) |
| F | Track/Chapter Groups — Collapse nur UI, kein Group-Bus | **IMPLEMENTED / AUTOMATED-TESTED** |
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
| Zettel | Track / Mixer Channel Rename — one shared display name; inline edit from header or mixer | **PLANNED / NOT IMPLEMENTED** |
| Zettel | Track Color — one shared color from Timeline header and Mixer channel | **PLANNED / NOT IMPLEMENTED** |
| Zettel | Distribute Colors — sequential palette on a selection or Chapter group | **PLANNED / NOT IMPLEMENTED** |

## F Evidence Report (MODE A)

**IMPLEMENTED / AUTOMATED-TESTED.** Not HUMAN-PROVEN (no MODE B EXE this pass).

### Files

- `src/core/track-groups.ts` — group model, assign/rename, arrange rows, last-lane chrome host
- `src/core/models.ts` — `TrackGroup`; optional `Project.groups`; `Track.groupId` still membership
- `src/core/project.ts` — `groups: []` default; deserialize hydrates from `groups` + stem `groupId`
- `src/core/stem-import.ts` — prefix `groupId` upserts `Project.groups`
- `src/core/layout-prefs.ts` — `resonance-studio-v5-group-collapsed` (JSON id list)
- `src/app/commands.ts` / `src/app/session.ts` — `createTrackGroup` / `assignTracksToGroup` / `renameTrackGroup`
- `src/ui/timeline/Timeline.tsx` / `src/ui/mixer/Mixer.tsx` / `src/app/App.tsx` / `src/styles.css`
- Tests: `tests/core/track-groups.test.ts`, `tests/layout/track-groups.test.tsx`, layout-prefs + stem-import + zip-audio

### How to create / collapse a group

1. Select one or more audio lanes (or leave the last audio targeted).
2. Click **Grp** on the last audio header (next to `+/−`). Default name `Chapter N`. Or use the per-lane **—** dropdown → an existing group or **New group…**.
3. Stem import of files that share a prefix (`01_vocals.wav`, `01_drums.wav`) still writes `Track.groupId` and now also a `Project.groups` row (`id`/`name` = `01`). Rename the header to e.g. `Chapter IV — New Reality`.
4. Collapse: chevron on the Timeline group header **or** the Mixer group strip. Child lanes/channels hide. Expand restores the same rows.
5. `+/−` stay on the last **visible** audio lane; if that lane is inside a collapsed group, they move onto that group header.

### Persistence

| What | Where | Persist? |
| --- | --- | --- |
| Group id + display name + track membership (`Track.groupId`) | Project JSON (`schemaVersion` 5, `groups: []` default) | **Yes** (Speichern) |
| Collapse open/closed | `localStorage` key `resonance-studio-v5-group-collapsed` | **Yes** (layout-prefs, not the project file) |

Collapse does **not** change playback, mute/solo, volume, pan, routing, or export mix. No group bus / group FX / group mute.

## Future UI (zettel — production-adjacent, not next slice)

**PLANNED / NOT IMPLEMENTED.** Not HUMAN-PROVEN. Not Production Pass G. Do not implement in this F pass.

`Track.name` already exists as the lane/mixer label (defaults A1…; stem import may write a filename). There is **no** inline rename UI, **no** track color property, **no** Distribute Colors. Project rename and marker rename are unrelated.

### Track / Mixer Channel Rename

A track can be renamed from either representation:

- Timeline track header → click / double-click name → inline edit
- Mixer channel label → click / double-click name → inline edit
- Enter = confirm, Esc = cancel

Both edit the **same** underlying track display name (`Track.name`). Never duplicated state.

Example: internal id stays `A12` (stable). Display name `Lead Vocals`. Rename in Timeline A12→Lead Vocals → Mixer shows Lead Vocals immediately. Rename in Mixer Lead Vocals→Lead Vox → Timeline shows Lead Vox immediately.

Rules:

- one shared display name
- internal track ID remains stable (legacy `A1`/`A2`, generated `a_*`, labels A3…)
- rename must not affect routing, clips, automation, or grouping
- name persists through save / load

### Track Color

Color assignable from Timeline track header **and** Mixer channel; both modify the same track color property.

Reflected consistently in: Timeline track, audio clips, Mixer channel, later automation lanes (when G exists).

### Distribute Colors

For a selected set of tracks or a Chapter group (F):

- Distribute Colors
- assign palette colors sequentially
- same colors appear in Timeline + Mixer
- individual colors remain editable afterwards
- persists through save / load
