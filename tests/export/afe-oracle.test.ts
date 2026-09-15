import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { ALL_FORMATS, BufferSource, EncodedPacketSink, Input } from "mediabunny";
import { describe, expect, it } from "vitest";
import { buildRequestPlan, summarizePlan } from "./afe-plan";
import {
  keyframeAtOrBefore,
  parseIsoBmff,
  sampleIndexAtTime,
  type AfeMovie,
  type AfeMismatch,
} from "../../src/core/frame-engine";

type Manifest = {
  generated: boolean;
  width: number;
  height: number;
  files: {
    id: string;
    path: string;
    fps: number;
    seconds: number;
    frames: number;
    gop: number;
    keyframeSec: number[];
    width?: number;
    height?: number;
  }[];
};

const PTS_EPS = 1e-6;

describe("AFE vs Mediabunny packet oracle (≥10,000 requests)", () => {
  it("matches Mediabunny EncodedPacketSink timestamps exactly on the full plan", async () => {
    const manifest = JSON.parse(readFileSync("tests/fixtures/afe/manifest.json", "utf8")) as Manifest;
    const rows = buildRequestPlan(manifest);
    const plan = summarizePlan(rows);
    expect(plan.total).toBeGreaterThanOrEqual(10_000);

    const movies = new Map<string, AfeMovie>();
    const sinks = new Map<string, { input: Input; sink: EncodedPacketSink }>();

    try {
      for (const file of manifest.files) {
        const bytes = new Uint8Array(readFileSync(file.path));
        movies.set(file.id, parseIsoBmff(bytes));
        const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error(`no video track ${file.id}`);
        sinks.set(file.id, { input, sink: new EncodedPacketSink(track) });
      }

      const mismatches: AfeMismatch[] = [];
      let compared = 0;
      let exact = 0;

      for (const row of rows) {
        const movie = movies.get(row.file)!;
        const opened = sinks.get(row.file)!;
        const packet = await opened.sink.getPacket(row.requestedSec);
        const afeIndex = sampleIndexAtTime(movie, row.requestedSec);
        const afeSample = afeIndex == null ? null : movie.samples[afeIndex]!;
        const afePts = afeSample ? afeSample.ptsTimescale / movie.timescale : null;
        const mbPts = packet ? packet.timestamp : null;
        compared += 1;

        const bothNull = afePts == null && mbPts == null;
        const ptsMatch = afePts != null && mbPts != null && Math.abs(afePts - mbPts) <= PTS_EPS;
        if (bothNull || ptsMatch) {
          exact += 1;
          continue;
        }

        mismatches.push({
          file: row.file,
          requestedSec: row.requestedSec,
          mediabunnyFrame: mbPts == null ? null : Math.round(mbPts * row.fps),
          afeFrame: afeIndex,
          mediabunnyPts: mbPts,
          afePts,
          dts: afeSample ? afeSample.dtsTimescale / movie.timescale : null,
          nearestKeyframe: afeIndex == null ? null : keyframeAtOrBefore(movie, afeIndex),
          frameDelta: afeIndex == null || mbPts == null ? null : afeIndex - Math.round(mbPts * row.fps),
        });
      }

      mkdirSync("docs/compliance", { recursive: true });
      const summary = {
        oracle: "mediabunny EncodedPacketSink.getPacket",
        compared,
        exact,
        mismatches: mismatches.length,
        plan,
        firstMismatches: mismatches.slice(0, 32),
      };
      writeFileSync("docs/compliance/afe-oracle-summary.json", JSON.stringify(summary, null, 2) + "\n");

      expect(compared).toBe(plan.total);
      expect(mismatches, JSON.stringify(mismatches.slice(0, 8), null, 2)).toHaveLength(0);
      expect(exact).toBe(compared);
    } finally {
      for (const opened of sinks.values()) {
        try {
          opened.input.dispose();
        } catch {
          /* */
        }
      }
    }
  }, 120_000);

  it("jsdom cannot decode H.264 — pixel A/B lives in Chrome evidence", () => {
    expect(typeof VideoDecoder).toBe("undefined");
    const evidencePath = "docs/compliance/afe-evidence.json";
    if (!existsSync(evidencePath)) {
      expect(existsSync("scripts/afe-frame-harness.html")).toBe(true);
      return;
    }
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
      totals?: { compared?: number; afe?: { EXACT?: number } };
      environment?: { userAgent?: string };
    };
    expect(evidence.totals?.compared).toBeGreaterThan(0);
    expect(evidence.environment?.userAgent).toMatch(/Chrome|Chromium/i);
  });
});
