/** Shared constants for MBR frame-identity media (generator + browser harness). */

export const MBR_WIDTH = 160;
export const MBR_HEIGHT = 90;
export const MBR_CELL = 16;
export const MBR_OX = 8;
export const MBR_OY = 8;
export const MBR_BITS = 16;

/** Paint one RGB24 frame with a 4×4 black/white barcode of `frameIndex`. */
export function paintIdentityFrame(buf, width, height, frameIndex) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      buf[i] = 20;
      buf[i + 1] = 24;
      buf[i + 2] = 32;
    }
  }
  for (let b = 0; b < MBR_BITS; b++) {
    const bit = (frameIndex >> b) & 1;
    const cx = MBR_OX + (b % 4) * MBR_CELL;
    const cy = MBR_OY + Math.floor(b / 4) * MBR_CELL;
    const v = bit ? 255 : 0;
    for (let y = 0; y < MBR_CELL; y++) {
      for (let x = 0; x < MBR_CELL; x++) {
        const i = ((cy + y) * width + (cx + x)) * 3;
        buf[i] = v;
        buf[i + 1] = v;
        buf[i + 2] = v;
      }
    }
  }
  const stripe = 8;
  const hue = frameIndex % 256;
  for (let y = 0; y < height; y++) {
    for (let x = width - stripe; x < width; x++) {
      const i = (y * width + x) * 3;
      buf[i] = hue;
      buf[i + 1] = 255 - hue;
      buf[i + 2] = (hue * 3) & 255;
    }
  }
}

export function readBarcodeFromImageData(data, width) {
  let n = 0;
  for (let b = 0; b < MBR_BITS; b++) {
    const cx = MBR_OX + (b % 4) * MBR_CELL + Math.floor(MBR_CELL / 2);
    const cy = MBR_OY + Math.floor(b / 4) * MBR_CELL + Math.floor(MBR_CELL / 2);
    const i = (cy * width + cx) * 4;
    const bit = (data[i] ?? 0) > 128 ? 1 : 0;
    n |= bit << b;
  }
  return n;
}

export function expectedFrameAtSec(timeSec, fps) {
  if (!Number.isFinite(timeSec) || timeSec < 0) return 0;
  return Math.max(0, Math.floor(timeSec * fps + 1e-9));
}

export function classifyFrameHit(expected, actual) {
  if (actual == null || !Number.isFinite(actual)) return "UNKNOWN";
  const delta = actual - expected;
  if (delta === 0) return "EXACT";
  if (Math.abs(delta) === 1) return "WITHIN 1 FRAME";
  return ">1 FRAME ERROR";
}

export function classifyError(kind) {
  if (kind === "timeout") return "TIMEOUT";
  if (kind === "seek") return "FAILED SEEK";
  if (kind === "wrong") return "WRONG FRAME";
  return "UNKNOWN";
}
