# AILEXSI Resonance Studio V5

Version **5.0.0**. Stand 2026-09-13. Ein-Blick-Tabelle: `CURRENT.md`.

Quelle der Wahrheit für diesen Stand: Branch `cursor/vis-silence-gate-d1d3` auf PR #8 `cursor/transport-follow-audio-loop-44f8` @ `05ffa9c`. `main` bleibt `314deff` (Stamp nach PR #3). Kein Force-Push auf `main`. AUTO, Encoder, Follow, Loop, Icons unangetastet.

Live-UI (Human-approved chrome, Vite `127.0.0.1:1421`, 2026-09-13):

![AILEXSI Resonance Studio V5 — File \| Import \| Export \| ARRANGE \| CUTTER; transport holds Split Undo Redo Snap Help](docs/ui-2026-09-13.png)

App icon: **愛** — Artwork `docs/ailexsi-app-icon.png` auf der PR-#5-Icon-Base. Diese PR fasst Icons nicht an.

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

## Help overlay

Scrollbares 2-Spalten-Sheet. `max-height` auf den sichtbaren Viewport (`dvh`/`vh`), sticky Header, innerer Scroll. Passt ins maximierte Fenster — untere Zeilen (Shift+edge-drag, roll, slip, …) bleiben erreichbar.

## S / Split

Nur **aktive/selektierte** Tracks unter VIS / V1 / V2 / A1 / A2:

- selektierte Clips → deren Tracks
- sonst Mixer/Lane-Multi-Select (`Ctrl`/`Cmd`+Klick)
- sonst `targetTrackId`
- Multi-Select OK
- Linked Mates auf **anderen** Tracks werden nicht mitgeschnitten

**VIS** (Human-verified): Wenn VIS fokussiert ist (Header oder Event), teilt S die VIS-Events / Cues / das Window am Playhead. V1–A2-Clips bleiben ganz.

Klick in die VIS-Lane (leerer Body oder Event-Fill, z.B. Tunnel) springt den Playhead — gleicher Snap-Seek wie Klick in V1/V2/A. Header- oder Event-Select blockiert das nicht. Event-Ziehen bleibt Move, nicht Seek.

## Follow playhead

Follow ON: Playhead läuft durch das linke Viewport, pinnt bei ~65% der sichtbaren Lane, danach scrollt **ein** `scrollMs` (Ruler, VIS, V1/V2, A1/A2). Seek paget nur, wenn die Nadel den View verlässt. Follow OFF: kein Auto-Scroll. Live Exe: NOT VERIFIED.

## Limits (ehrlich)

- **AUTO:** Video zuerst, VIS nur in der Lücke. Die AUTO-Zeile in `src/core/transition.ts` nicht anfassen.
- **Export:** H.264 MP4 über den Export-Dialog. AAC nur wenn Probe + Mix + Encode klappen; sonst `audio=none` plus Grund. WebM ist nie Erfolg. Dedicated **Export WAV**-Button ist entfernt. `startExport("wav")` bleibt intern erreichbar, hat aber keinen Toolbar-/Dialog-Weg.
- **Persistenz:** Exe merkt den letzten Projekt**pfad** (`last-project.json` in AppData). Save/Open in der Exe über Tauri-Dialog. Browser: Chrome File System Access; Firefox fällt auf Download zurück. Medien: Exe-IDB-Blob, sonst Datei unter `sourcePath`, sonst missing + Relink. Altes JSON ohne `sourcePath` braucht einmal Relink, dann Save.
- Chrome-Origin ≠ Exe-Origin. Ein im Browser gespeichertes Projekt erscheint **nicht** von allein in der Exe.
- Visualizer: viele Canvas-2D- und projizierte-3D-Modi. Features aus A1/Mix-PCM (Visualz-Onset), wenn Audio geladen ist — kein 120-BPM-Metronom. Playhead in einer A1/Mix-Lücke oder echter Stille: Visualz silence-gate, VIS bleibt ruhig.
- Kein Verkaufsprodukt. COMPLETE: NO.

## Fuer Bots

Basis: `cursor/vis-silence-gate-d1d3` auf PR #8 `05ffa9c`, Version 5.0.0.
Kein Force-Push auf `main`. AUTO-Zeile nicht ändern. Follow/Loop/Layout nicht anfassen. Export-Encoder nicht anfassen. Icons nicht anfassen.
Chrome dieser Revision: Top bar File \| Import \| Export \| [ARRANGE] \| [CUTTER]; Help auf Transport; Help-Sheet 2-col + Scroll; S nur aktive/selektierte Tracks inkl. VIS (Human-verified). VIS-Lane-Klick seekt wie V/A.
Follow-Playhead-Pin: TEST-VERIFIED auf der Transport-PR-Linie (65%-Anchor + shared scrollMs). Live Exe: NOT VERIFIED.
Nächster Slice: Exe zu/auf nach Relink+Save (keine missing-Parade).
