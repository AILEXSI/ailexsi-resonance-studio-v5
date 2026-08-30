import { describe, expect, it } from "vitest";
import {
  collectFilmstripTimes,
  filmstripTimes,
  peaksFromChannel,
  peaksToPath,
  slicePeaks,
} from "../../src/core/clip-preview";

function sine(length: number, cycles: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.sin((i / length) * cycles * Math.PI * 2);
  }
  return out;
}

describe("waveform peaks", () => {
  it("renders a path from fixture samples (no WebAudio)", () => {
    const samples = sine(4800, 8);
    const peaks = peaksFromChannel(samples, 64);
    expect(peaks.length).toBe(64);
    expect(Math.max(...peaks)).toBeGreaterThan(0.5);
    const d = peaksToPath(peaks, 200, 36);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.includes(" L ")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.length).toBeGreaterThan(80);
  });

  it("slices peaks to the clip source range", () => {
    const peaks = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0]);
    const mid = slicePeaks(peaks, 250, 750, 1000);
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.length).toBeLessThan(peaks.length);
  });
});

describe("video filmstrip", () => {
  it("requests N thumbs along the clip duration via a stubbed decoder", async () => {
    const requested: number[] = [];
    const frames = await collectFilmstripTimes(
      { sourceInMs: 0, sourceOutMs: 10_000, clipWidthPx: 240, thumbWidthPx: 48 },
      async (timeMs) => {
        requested.push(timeMs);
        return `stub:${Math.round(timeMs)}`;
      },
    );
    expect(requested).toHaveLength(5);
    expect(frames).toHaveLength(5);
    expect(requested[0]).toBeGreaterThanOrEqual(0);
    expect(requested[requested.length - 1]!).toBeLessThan(10_000);
    for (let i = 1; i < requested.length; i += 1) {
      expect(requested[i]!).toBeGreaterThan(requested[i - 1]!);
    }
    const planned = filmstripTimes({
      sourceInMs: 1000,
      sourceOutMs: 5000,
      clipWidthPx: 96,
      thumbWidthPx: 48,
    });
    expect(planned).toHaveLength(2);
    expect(planned[0]).toBeGreaterThan(1000);
    expect(planned[1]).toBeLessThan(5000);
  });
});
