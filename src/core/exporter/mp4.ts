/** Minimal ISO-BMFF muxer for AVC (H.264) WebCodecs output. */

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function u8(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function u16(n: number): Uint8Array {
  return u8((n >> 8) & 0xff, n & 0xff);
}

function u32(n: number): Uint8Array {
  return u8((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function fourcc(tag: string): Uint8Array {
  return u8(tag.charCodeAt(0), tag.charCodeAt(1), tag.charCodeAt(2), tag.charCodeAt(3));
}

function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
  const payload = concat(...payloads);
  return concat(u32(8 + payload.length), fourcc(type), payload);
}

function fullBox(type: string, version: number, flags: number, ...payloads: Uint8Array[]): Uint8Array {
  return box(type, u8(version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff), ...payloads);
}

function asciiPad(text: string, size: number): Uint8Array {
  const out = new Uint8Array(size);
  const n = Math.min(text.length, size);
  for (let i = 0; i < n; i++) out[i] = text.charCodeAt(i);
  return out;
}

function identityMatrix(): Uint8Array {
  return concat(
    u32(0x00010000), u32(0), u32(0),
    u32(0), u32(0x00010000), u32(0),
    u32(0), u32(0), u32(0x40000000),
  );
}

export interface AvcSample {
  data: Uint8Array;
  timestampUs: number;
  durationUs: number;
  key: boolean;
}

function extractAvcC(description: Uint8Array): Uint8Array {
  if (description.length >= 8) {
    const tag = String.fromCharCode(
      description[4] ?? 0,
      description[5] ?? 0,
      description[6] ?? 0,
      description[7] ?? 0,
    );
    if (tag === "avcC") {
      const size = ((description[0] ?? 0) << 24) | ((description[1] ?? 0) << 16) | ((description[2] ?? 0) << 8) | (description[3] ?? 0);
      return description.slice(8, size);
    }
  }
  return description;
}

export function muxAvcToMp4(opts: {
  width: number;
  height: number;
  fps: number;
  description: Uint8Array;
  samples: AvcSample[];
}): Uint8Array {
  if (opts.samples.length === 0) {
    throw new Error("No encoded samples to mux");
  }
  const avcC = extractAvcC(opts.description);
  if (avcC.length < 7) {
    throw new Error("Missing AVC decoder config (avcC)");
  }

  const timescale = 30000;
  const sampleDeltas = opts.samples.map((s) =>
    Math.max(1, Math.round((s.durationUs / 1_000_000) * timescale)),
  );
  const duration = sampleDeltas.reduce((a, b) => a + b, 0);

  const mdatPayload = concat(...opts.samples.map((s) => s.data));
  const mdat = box("mdat", mdatPayload);
  const mdatHeaderSize = 8;

  const sttsEntries: number[] = [];
  for (const delta of sampleDeltas) {
    const last = sttsEntries.length - 2;
    if (last >= 0 && sttsEntries[last + 1] === delta) {
      sttsEntries[last] += 1;
    } else {
      sttsEntries.push(1, delta);
    }
  }
  const sttsParts = [u32(sttsEntries.length / 2)];
  for (let i = 0; i < sttsEntries.length; i += 2) {
    sttsParts.push(u32(sttsEntries[i]!), u32(sttsEntries[i + 1]!));
  }
  const stts = fullBox("stts", 0, 0, ...sttsParts);

  const keyIndexes = opts.samples
    .map((s, i) => (s.key ? i + 1 : 0))
    .filter((i) => i > 0);
  const stss = fullBox(
    "stss",
    0,
    0,
    u32(keyIndexes.length),
    ...keyIndexes.map((i) => u32(i)),
  );

  const stsc = fullBox("stsc", 0, 0, u32(1), u32(1), u32(opts.samples.length), u32(1));
  const stsz = fullBox(
    "stsz",
    0,
    0,
    u32(0),
    u32(opts.samples.length),
    ...opts.samples.map((s) => u32(s.data.length)),
  );

  const ftyp = box(
    "ftyp",
    fourcc("isom"),
    u32(0x00000200),
    fourcc("isom"),
    fourcc("iso2"),
    fourcc("avc1"),
    fourcc("mp41"),
  );

  // stco offset is computed after we know ftyp + moov sizes. First build moov with a placeholder.
  const placeholderOffset = 0;
  const buildMoov = (chunkOffset: number): Uint8Array => {
    const stco = fullBox("stco", 0, 0, u32(1), u32(chunkOffset));
    const avc1 = box(
      "avc1",
      new Uint8Array(6),
      u16(1),
      u16(0),
      u16(0),
      u32(0),
      u32(0),
      u32(0),
      u16(opts.width),
      u16(opts.height),
      u32(0x00480000),
      u32(0x00480000),
      u32(0),
      u16(1),
      asciiPad("AILEXSI V5", 32),
      u16(0x0018),
      u16(0xffff),
      box("avcC", avcC),
    );
    const stsd = fullBox("stsd", 0, 0, u32(1), avc1);
    const stbl = box("stbl", stsd, stts, stsc, stsz, stco, stss);
    const dref = fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1));
    const dinf = box("dinf", dref);
    const vmhd = fullBox("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0));
    const minf = box("minf", vmhd, dinf, stbl);
    const hdlr = fullBox(
      "hdlr",
      0,
      0,
      u32(0),
      fourcc("vide"),
      u32(0),
      u32(0),
      u32(0),
      asciiPad("VideoHandler", 13),
    );
    const mdhd = fullBox(
      "mdhd",
      0,
      0,
      u32(0),
      u32(0),
      u32(timescale),
      u32(duration),
      u16(0x55c4),
      u16(0),
    );
    const mdia = box("mdia", mdhd, hdlr, minf);
    const tkhd = fullBox(
      "tkhd",
      0,
      0x000007,
      u32(0),
      u32(0),
      u32(1),
      u32(0),
      u32(duration),
      u32(0),
      u32(0),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      identityMatrix(),
      u32(opts.width << 16),
      u32(opts.height << 16),
    );
    const trak = box("trak", tkhd, mdia);
    const mvhd = fullBox(
      "mvhd",
      0,
      0,
      u32(0),
      u32(0),
      u32(timescale),
      u32(duration),
      u32(0x00010000),
      u16(0x0100),
      u16(0),
      u32(0),
      u32(0),
      identityMatrix(),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(0),
      u32(2),
    );
    return box("moov", mvhd, trak);
  };

  let moov = buildMoov(placeholderOffset);
  const chunkOffset = ftyp.length + moov.length + mdatHeaderSize;
  moov = buildMoov(chunkOffset);
  return concat(ftyp, moov, mdat);
}
