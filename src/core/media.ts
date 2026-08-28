import { createId } from "./ids";
import type { MediaAsset, MediaKind } from "./models";

export class ImportError extends Error {
  readonly code: "WRONG_TYPE" | "PROBE_FAILED" | "EMPTY";
  constructor(code: ImportError["code"], message: string) {
    super(message);
    this.name = "ImportError";
    this.code = code;
  }
}

export interface MediaProbe {
  durationMs: number;
  width?: number;
  height?: number;
}

export type ProbeFn = (file: File) => Promise<MediaProbe>;

const VIDEO_MIME = /^video\//i;
const AUDIO_MIME = /^audio\//i;

export function classifyFile(file: File): MediaKind {
  if (VIDEO_MIME.test(file.type)) return "video";
  if (AUDIO_MIME.test(file.type)) return "audio";
  const name = file.name.toLowerCase();
  if (/\.(mp4|webm|mov|mkv|m4v)$/.test(name) && !file.type) return "video";
  if (/\.(wav|mp3|ogg|m4a|aac|flac)$/.test(name) && !file.type) return "audio";
  throw new ImportError(
    "WRONG_TYPE",
    `Rejected ${file.name || "file"}: only audio and video are allowed (got ${file.type || "unknown type"})`,
  );
}

export function probeWithElement(file: File): Promise<MediaProbe> {
  return new Promise((resolve, reject) => {
    const kind = classifyFile(file);
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    const cleanup = () => {
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    };
    el.onloadedmetadata = () => {
      const durationMs = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0;
      const width = kind === "video" ? (el as HTMLVideoElement).videoWidth : undefined;
      const height = kind === "video" ? (el as HTMLVideoElement).videoHeight : undefined;
      cleanup();
      if (durationMs <= 0) {
        reject(new ImportError("PROBE_FAILED", `Could not read duration of ${file.name}`));
        return;
      }
      resolve({ durationMs, width, height });
    };
    el.onerror = () => {
      cleanup();
      reject(new ImportError("PROBE_FAILED", `Failed to read ${file.name}`));
    };
    el.src = url;
  });
}

export async function importMediaFile(
  file: File,
  probe: ProbeFn = probeWithElement,
): Promise<MediaAsset> {
  if (!file || file.size <= 0) {
    throw new ImportError("EMPTY", "File is empty");
  }
  const kind = classifyFile(file);
  const meta = await probe(file);
  const id = createId("asset");
  const objectUrl =
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : undefined;
  return {
    id,
    name: file.name,
    kind,
    mimeType: file.type || (kind === "video" ? "video/unknown" : "audio/unknown"),
    durationMs: meta.durationMs,
    blobId: id,
    objectUrl,
    missing: false,
    width: meta.width,
    height: meta.height,
  };
}

export function defaultTrackForKind(kind: MediaKind): "V1" | "A1" {
  return kind === "video" ? "V1" : "A1";
}
