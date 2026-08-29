import { audioClipsForMix } from "./job";
import { decodeAudio, isPlayableSource } from "./media";
import type { AacSample } from "./mp4";
import type { ExportHooks, ExportJob } from "./types";

export type AacProbe = {
  sampleRate: number;
  channels: number;
  bitrate: number;
};

const AAC_CODEC = "mp4a.40.2";

export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { window.clearTimeout(t); resolve(v); },
      (e) => { window.clearTimeout(t); reject(e); },
    );
  });
}

export async function probeAac(): Promise<AacProbe | null> {
  if (typeof AudioEncoder === "undefined") return null;
  const candidates: AacProbe[] = [
    { sampleRate: 44100, channels: 2, bitrate: 128_000 },
    { sampleRate: 48000, channels: 2, bitrate: 128_000 },
    { sampleRate: 44100, channels: 1, bitrate: 96_000 },
    { sampleRate: 48000, channels: 1, bitrate: 96_000 },
  ];
  for (const c of candidates) {
    try {
      let failed = false;
      const encoder = new AudioEncoder({
        output: () => {},
        error: () => {
          failed = true;
        },
      });
      encoder.configure({
        codec: AAC_CODEC,
        numberOfChannels: c.channels,
        sampleRate: c.sampleRate,
        bitrate: c.bitrate,
      });
      encoder.close();
      if (!failed) return c;
    } catch {
      /* next */
    }
  }
  return null;
}

export async function mixJobAudio(
  job: ExportJob,
  probe: AacProbe,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  const clips = audioClipsForMix(job).filter((c) => isPlayableSource(c.sourceUrl));
  if (clips.length === 0) return null;
  const length = Math.max(1, Math.ceil((job.durationMs / 1000) * probe.sampleRate));
  const ctx = new OfflineAudioContext(probe.channels, length, probe.sampleRate);
  let added = 0;
  for (const clip of clips) {
    if (signal?.aborted) throw new Error("Export aborted");
    try {
      const decoded = await decodeAudio(clip.sourceUrl);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      const gain = ctx.createGain();
      gain.gain.value = Number.isFinite(clip.gain) ? Math.max(0, clip.gain) : 1;
      src.connect(gain);
      gain.connect(ctx.destination);
      const startSec = Math.max(0, clip.startMs / 1000);
      const offsetSec = Math.max(0, clip.sourceInMs / 1000);
      const durSec = Math.max(0.01, (clip.endMs - clip.startMs) / 1000);
      src.start(startSec, offsetSec, durSec);
      added += 1;
    } catch {
      /* skip unreadable audio; video-only is still success */
    }
  }
  if (!added) return null;
  return ctx.startRendering();
}

function stripAdts(data: Uint8Array): Uint8Array {
  if (data.length >= 7 && data[0] === 0xff && (data[1]! & 0xf0) === 0xf0) {
    const hasCrc = (data[1]! & 0x01) === 0;
    return data.subarray(hasCrc ? 9 : 7);
  }
  return data;
}

function descriptionBytes(desc: AllowSharedBufferSource | undefined): Uint8Array | undefined {
  if (!desc) return undefined;
  if (desc instanceof ArrayBuffer) return new Uint8Array(desc);
  if (ArrayBuffer.isView(desc)) {
    return new Uint8Array(desc as ArrayBufferView as Uint8Array);
  }
  return undefined;
}

export async function encodeAac(
  buffer: AudioBuffer,
  probe: AacProbe,
  hooks: ExportHooks = {},
): Promise<{ samples: AacSample[]; description: Uint8Array } | null> {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return null;

  const samples: AacSample[] = [];
  let description: Uint8Array | undefined;
  let encoderError: Error | undefined;

  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const desc = descriptionBytes(meta?.decoderConfig?.description);
      if (desc && desc.byteLength > 0) description = desc;
      const raw = new Uint8Array(chunk.byteLength);
      chunk.copyTo(raw);
      const data = stripAdts(raw);
      if (data.byteLength === 0) return;
      samples.push({
        data,
        timestampUs: chunk.timestamp,
        durationUs: chunk.duration ?? Math.round((1024 / probe.sampleRate) * 1_000_000),
      });
    },
    error: (e) => {
      encoderError = e;
    },
  });

  try {
    encoder.configure({
      codec: AAC_CODEC,
      numberOfChannels: probe.channels,
      sampleRate: probe.sampleRate,
      bitrate: probe.bitrate,
    });

    const channels = Math.min(probe.channels, buffer.numberOfChannels);
    const frameSize = 1024;
    for (let offset = 0; offset < buffer.length; offset += frameSize) {
      if (hooks.signal?.aborted) throw new Error("Export aborted");
      if (encoderError) throw encoderError;
      const frames = Math.min(frameSize, buffer.length - offset);
      const planar = new Float32Array(frames * channels);
      for (let c = 0; c < channels; c++) {
        planar.set(buffer.getChannelData(c).subarray(offset, offset + frames), c * frames);
      }
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate: buffer.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: channels,
        timestamp: Math.round((offset / buffer.sampleRate) * 1_000_000),
        data: planar,
      });
      encoder.encode(audioData);
      audioData.close();
    }

    await encoder.flush();
    encoder.close();
  } catch {
    try {
      encoder.close();
    } catch {
      /* already closed */
    }
    return null;
  }

  if (!description || samples.length === 0) return null;
  return { samples, description };
}
