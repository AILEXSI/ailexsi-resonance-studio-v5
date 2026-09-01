# AILEXSI Resonance Studio V5

Stand: 2026-09-02. Version 5.0.0.

## Wo die Wahrheit liegt

- Ordner: `C:\\Users\\marti\\ResonanceStudio-V5`
- Branch lokal: `pr-1`
- Gleicher Stand auf GitHub: Branch `cursor/visualz-scenes-7f5e`
- Spitze (2026-08-30 Code): `b6b5d69`

`main` war hinterher (alter Stand `b4d2d81`). Nicht auf `main` weiterbauen, bis dieser Branch dort drin ist.

Kurzfassung: siehe `CURRENT.md`.

## Was das ist

Lokaler Video- und Audio-Schnitt auf http://127.0.0.1:1421.
Standalone = Chrome oder Edge als App-Fenster (`--app=http://127.0.0.1:1421`), keine gebaute Tauri-Exe.
`src-tauri` liegt nur rum. Kein Verkaufsprodukt.

## Start (Windows)

Doppelklick `Start-V5.cmd`

oder:

```
cd C:\\Users\\marti\\ResonanceStudio-V5
npm run dev
```

Dann App-Fenster: Chrome `--app=http://127.0.0.1:1421`

Tab und App-Fenster sind dieselbe App.
Button **Zuletzt geladen** erscheint nur, wenn dieses Fenster schon eine Projektdatei kennt.

## Geprueft am Rechner (2026-09-02)

- Spuren V1 V2 A1 A2, VIS, Arrange/Cutter, Mixer
- Export MP4 muxed: H.264 1280x720 + AAC Stereo (`Untitled_Resonance.mp4`, ffprobe `avc1` + `mp4a`)
- Viele Visualizer-Szenen (2D + 3D-Optik), inkl. crystal-storm und Cues im Song
- WebM zaehlt nicht als Erfolg

## Alt und falsch (Bot-Texte)

- nur 2 Visualizer-Modi Bars/Orb
- MP4 nur Bild, keine AAC-Spur
- GrokBuild-Slice gegen `main` / `b4d2d81` als Produkt

## Fuer Bots

Basis: `cursor/visualz-scenes-7f5e` @ `b6b5d69` (oder neuer Commit auf diesem Branch).
Szenen und Cues nicht auf Bars/Orb zurueckschneiden.
Naechster Slice: Features aus echtem A1/A2-Mix auf diesem Branch.
Kein Force-Push.

COMPLETE: NO. Not for sale.
