# AILEXSI Resonance Studio V5

Version **5.0.0**. Stand 2026-09-13. Ein-Blick-Tabelle: `CURRENT.md`.

Quelle der Wahrheit für diesen Stand: `CURRENT.md`. Human-verified A Follow, B audio VIS + silence gate, C Loop-off (`0df5da1`). Production Pass **D DONE / Human-OK** — Root exe 2026-09-13, PR #10, `511acad` (dynamic audio collection, ≥64, stable IDs). Close-out Tip → `main` (`9ceb9bd`). Kein Force-Push auf `main`. AUTO und Icons unangetastet. E–N: **PLANNED / NOT IMPLEMENTED**.

Live-UI (Human-approved chrome, Vite `127.0.0.1:1421`, 2026-09-13):

![AILEXSI Resonance Studio V5 — File \| Import \| Export \| ARRANGE \| CUTTER; transport holds Split Undo Redo Snap Help](docs/ui-2026-09-13.png)

App icon: **愛** — Artwork `docs/ailexsi-app-icon.png` auf der PR-#5-Icon-Base. Icons nicht anfassen.

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

Standalone — Root-Exe:

```
npm run tauri:exe
```

Kopiert die Release-Exe nach Repo-Root: `AILEXSI Resonance Studio V5.exe`.
Zusätzlich: `src-tauri\\target\\release\\`.
Root exe: **Human-OK D** 2026-09-13 (PR #10, `511acad`).

## Top bar

`File | Import | Export | [ARRANGE] | [CUTTER]`

- **File** — öffnet/schließt das Projekt-Overlay.
- **Import** — lokaler Media-Dialog (Video/Musik/Bilder). Einziger Datei-Eingang in der Leiste.
- **Export** — öffnet den H.264-MP4-Export-Dialog. Kein zweiter Encoder-Button.
- **[ARRANGE] / [CUTTER]** — Production-Screens. Kein Reload, kein Projekt-Reset.
- **Nicht oben:** Export WAV, Help, Undo, Redo, Split, Snap, `+A`/`−A`. Media-Button bleibt weg. Fit-Zeile hat kein `+A`/`−A`.

## Transport

`Play | Pause | Stop | … | Split | Undo | Redo | Snap | Help`

Help (`?`) sitzt auf der Play-Zeile, nicht in der Top bar.

## File overlay

`New | Speichern | Speichern unter | Öffnen | Zuletzt`

- **Kein** Ordner wählen. **Kein** Revert. **Keine** MEDIA-Durchsuchen-Zeile.
- Media-Bin im Overlay (Suche/Filter/Place/Relink) lädt keine Dateien — das macht **Import**.
- **Speichern unter:** Chrome `showSaveFilePicker` (Ordner + Name). Tauri/Exe: nativer Save-Dialog (Ordner + Name, immer Picker). Firefox ohne FSA: Download.

## Help overlay

Scrollbares 2-Spalten-Sheet. `max-height` auf den sichtbaren Viewport (`dvh`/`vh`), sticky Header, innerer Scroll. Passt ins maximierte Fenster — untere Zeilen (Shift+edge-drag, roll, slip, …) bleiben erreichbar.

## S / Split

Nur **aktive/selektierte** Tracks unter VIS / V1 / V2 / audio collection:

- selektierte Clips → deren Tracks
- sonst Mixer/Lane-Multi-Select (`Ctrl`/`Cmd`+Klick)
- sonst `targetTrackId`
- Multi-Select OK
- Linked Mates auf **anderen** Tracks werden nicht mitgeschnitten

**VIS** (Human-verified): Wenn VIS fokussiert ist (Header oder Event), teilt S die VIS-Events / Cues / das Window am Playhead. V/A-Clips bleiben ganz.

Klick in die VIS-Lane (leerer Body oder Event-Fill, z.B. Tunnel) springt den Playhead — gleicher Snap-Seek wie Klick in V1/V2/A. Header- oder Event-Select blockiert das nicht. Event-Ziehen bleibt Move, nicht Seek.

## Compact headers

Kurze Lanes (`< 46px`): VIS packt `VIS [M] [Scene]` in eine Zeile; V/A packt `V1 [M] [S]`. Default-Höhe ~52px bleibt Name über den Buttons.

## Tracks

Audio ist eine Collection, kein A1/A2-Limit. Kapazität ≥64, stabile IDs, Labels A1, A2, A3…. Lane-Template wie A1/A2; M/S unverändert. Kleine transluzente runde `+`/`−` nur am **letzten** Audio-Header (`−` hidden bei Floor 2, `+` disabled bei 64). Fit-Zeile ohne `+A`/`−A`. Lanes vertikal scrollbar; Mixer-Kanäle unabhängig scrollbar.

## Follow playhead

**HUMAN-VERIFIED** (Chrome + local exe @ `0df5da1`). Follow ON: Playhead läuft durch das linke Viewport, pinnt bei ~65% der sichtbaren Lane, danach scrollt **ein** `scrollMs` (Ruler, VIS, V1/V2, audio collection). Seek paget nur, wenn die Nadel den View verlässt. Follow OFF: kein Auto-Scroll, kein Force-Scroll.

## Loop

**HUMAN-VERIFIED.** Loop OFF spielt über OUT weiter — OUT ist ein Marker, kein Playback-Stop. Loop ON wrappt OUT→IN.

## Limits (ehrlich)

- **AUTO:** Video zuerst, VIS nur in der Lücke. Die AUTO-Zeile in `src/core/transition.ts` nicht anfassen.
- **Export:** H.264 MP4 über den Export-Dialog. AAC nur wenn Probe + Mix + Encode klappen; sonst `audio=none` plus Grund. WebM ist nie Erfolg. Dedicated **Export WAV**-Button ist entfernt. `startExport("wav")` bleibt intern erreichbar, hat aber keinen Toolbar-/Dialog-Weg.
- **Persistenz:** Exe merkt den letzten Projekt**pfad** (`last-project.json` in AppData). Save/Open in der Exe über Tauri-Dialog. Browser: Chrome File System Access; Firefox fällt auf Download zurück. Medien: Exe-IDB-Blob, sonst Datei unter `sourcePath`, sonst missing + Relink. Altes JSON ohne `sourcePath` braucht einmal Relink, dann Save.
- Chrome-Origin ≠ Exe-Origin. Ein im Browser gespeichertes Projekt erscheint **nicht** von allein in der Exe.
- Visualizer: viele Canvas-2D- und projizierte-3D-Modi. Features aus first-audible-audio / Mix-PCM (Visualz-Onset/Energy), wenn Audio geladen ist — Default-Projekte A1-first, kein 120-BPM-Metronom. Playhead in einer Audio/Mix-Lücke oder echter Stille: Visualz silence-gate (`rms`/`bass`), VIS bleibt ruhig. Beat = audio-derived onset/energy sync, **kein** DAW Beat-Grid-Lock.
- **D audio:** Collection ≥64, stabile IDs. Kein `+A`/`−A` an Fit/Toolbar. **E–N** planned.
- Kein Verkaufsprodukt. COMPLETE: NO.

## Fuer Bots

Basis: `cursor/dynamic-audio-tracks-2ecf` @ `511acad` (PR #10), Version 5.0.0. `main` tip `9ceb9bd`. Close-out Tip → `main`.
Kein Force-Push auf `main`. AUTO-Zeile nicht ändern. Export-Encoder nicht anfassen. Icons nicht anfassen.
Chrome: Top bar File \| Import \| Export \| [ARRANGE] \| [CUTTER]; Help auf Transport; Help-Sheet 2-col + Scroll; compact headers VIS+V/A; S nur aktive/selektierte Tracks inkl. VIS (Human-verified). VIS-Lane-Klick seekt wie V/A. Speichern unter picker. Kein `+A`/`−A` oben / an Fit.
A Follow: HUMAN-VERIFIED — 65%-Anchor + shared `scrollMs`; Follow OFF kein Force-Scroll.
B VIS: HUMAN-VERIFIED — first-audible / mix PCM Visualz onset/energy; silence gate in Audio-Lücken; kein 120-BPM-Metronom wenn das Projekt Audio hat. Beat ≠ DAW-Grid-Lock.
C Loop: HUMAN-VERIFIED — Loop OFF weiter über OUT; Loop ON wrappt OUT→IN.
Production Pass **D DONE / Human-OK** — Root exe 2026-09-13, PR #10, `511acad` (dynamic audio ≥64, stable IDs, last-header +/−, vertical lane + mixer scroll).
E–N: **PLANNED / NOT IMPLEMENTED** — Details in `CURRENT.md`. VIS-Ausbau-Intent = K–N (BASICS / Audio Reactive / Modulation) dort.
Nächster Slice: Production Pass E (stem import), Human bestätigt vor Code.
