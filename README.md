# AILEXSI Resonance Studio V5

Clean-room browser NLE. V4 is reference-only and was not copied into this tree.
Product is the Vite app on http://127.0.0.1:1421 (strictPort, host 127.0.0.1).
src-tauri leftover unused.
Scripts listed in package.json: dev, build, test, fixtures.
Implemented: audio/video import with visible fail; V1 V2 A1 A2; timeline move/trim/split/snap/undo/IN-OUT/clear/loop/markers/copy-paste/mute; preview; inspector fields; resonance.json; IndexedDB; WebCodecs H.264 MP4 or FAIL.
WebM is never treated as export success.
VIS overlay lane cycles 6 Canvas-2D scenes ported from AILEXSI Visualz (@ailexsi/visualz 0.1.0-blueprint, https://github.com/AILEXSI/ailexsi-visualz @ b67410c) — not V4, not MilkDrop/Butterchurn: pulse-orb, spectrum-bars, particle-field, resonance-wave (default), tunnel-spiral, lita-bloom.
Limits: MP4 video-only; missing media encodes slate; no ffmpeg.wasm, MediaRecorder-as-success, Vault, LLM, beats, images.
See V5-EVIDENCE.md. Docs alone are not verification. Not complete. Not for sale.
