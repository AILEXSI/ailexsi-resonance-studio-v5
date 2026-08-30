import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { createSession, type Session } from "../../src/app/session";
import { jobFromProject } from "../../src/core/exporter/job";
import {
  clipGainEnvelope,
  fadeFactorAt,
  gainAtClipTime,
  normalizeClipFades,
  videoAlphaAtClipTime,
} from "../../src/core/fades";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { deserializeProject, serializeProject } from "../../src/core/project";
import { asset, clip, projectWith } from "../helpers";

function fadeSession(): Session {
  const a = asset({ id: "aa", kind: "audio", durationMs: 4000 });
  const c = clip({
    id: "c1",
    assetId: "aa",
    trackId: "A1",
    startMs: 0,
    durationMs: 2000,
    fadeInMs: 0,
    fadeOutMs: 0,
  });
  return {
    ...createSession(createMemoryBlobStore()),
    project: projectWith([c], [a]),
    selectedClipId: "c1",
  };
}

describe("normalizeClipFades", () => {
  it("defaults and clamps each fade to [0, duration]", () => {
    expect(normalizeClipFades(0, 0, 1000)).toEqual({ fadeInMs: 0, fadeOutMs: 0 });
    expect(normalizeClipFades(-50, 2000, 1000)).toEqual({ fadeInMs: 0, fadeOutMs: 1000 });
  });

  it("scales both fades so they meet in the middle when they would overlap", () => {
    expect(normalizeClipFades(800, 800, 1000)).toEqual({ fadeInMs: 500, fadeOutMs: 500 });
    expect(normalizeClipFades(1000, 1000, 1000)).toEqual({ fadeInMs: 500, fadeOutMs: 500 });
  });
});

describe("gainAtClipTime / fadeFactorAt", () => {
  const fadeIn = clip({
    id: "c",
    assetId: "a",
    trackId: "A1",
    durationMs: 2000,
    fadeInMs: 1000,
    fadeOutMs: 0,
    gain: 1,
  });

  it("fade factor at t=0 with fadeIn 1000 is 0; at 1000 is 1", () => {
    expect(fadeFactorAt(fadeIn, 0)).toBe(0);
    expect(gainAtClipTime(fadeIn, 0)).toBe(0);
    expect(fadeFactorAt(fadeIn, 1000)).toBe(1);
    expect(gainAtClipTime(fadeIn, 1000)).toBe(1);
  });

  it("is 1 in the middle and 0 at the end of fadeOut", () => {
    const both = { ...fadeIn, fadeOutMs: 500 };
    expect(gainAtClipTime(both, 1000)).toBe(1);
    expect(gainAtClipTime(both, 1500)).toBe(1);
    expect(gainAtClipTime(both, 2000)).toBe(0);
    expect(gainAtClipTime(both, 1750)).toBeCloseTo(0.5, 8);
  });

  it("multiplies the fade factor by clip gain", () => {
    expect(gainAtClipTime({ ...fadeIn, gain: 0.5 }, 500)).toBeCloseTo(0.25, 8);
    expect(gainAtClipTime({ ...fadeIn, gain: 2 }, 1000)).toBe(2);
  });

  it("uses the scaled envelope when fades would overlap", () => {
    const overlap = clip({
      id: "c",
      assetId: "a",
      trackId: "A1",
      durationMs: 1000,
      fadeInMs: 800,
      fadeOutMs: 800,
      gain: 1,
    });
    expect(gainAtClipTime(overlap, 0)).toBe(0);
    expect(gainAtClipTime(overlap, 500)).toBeCloseTo(1, 8);
    expect(gainAtClipTime(overlap, 1000)).toBe(0);
    expect(gainAtClipTime(overlap, 250)).toBeCloseTo(0.5, 8);
  });

  it("clamps video alpha to 0..1", () => {
    expect(videoAlphaAtClipTime({ ...fadeIn, gain: 4 }, 1000)).toBe(1);
    expect(videoAlphaAtClipTime(fadeIn, 0)).toBe(0);
  });
});

describe("clipGainEnvelope (mix helper)", () => {
  it("holds peak when fades are 0", () => {
    expect(clipGainEnvelope(1000, 0, 0, 0.8)).toEqual([
      { tMs: 0, value: 0.8 },
      { tMs: 1000, value: 0.8 },
    ]);
  });

  it("ramps 0→peak over fadeIn and peak→0 over fadeOut", () => {
    expect(clipGainEnvelope(2000, 1000, 500, 1)).toEqual([
      { tMs: 0, value: 0 },
      { tMs: 1000, value: 1 },
      { tMs: 1500, value: 1 },
      { tMs: 2000, value: 0 },
    ]);
  });
});

describe("setClipFades command + persist", () => {
  it("applyCommand setClipFades writes both fades in one history entry", () => {
    const start = fadeSession();
    const next = applyCommand(start, {
      type: "setClipFades",
      clipId: "c1",
      fadeInMs: 400,
      fadeOutMs: 250,
    });
    const c = next.project.clips.find((x) => x.id === "c1")!;
    expect(c.fadeInMs).toBe(400);
    expect(c.fadeOutMs).toBe(250);
    expect(next.history.past.length).toBe(start.history.past.length + 1);
    const undone = applyCommand(next, { type: "undo" });
    expect(undone.project.clips.find((x) => x.id === "c1")!.fadeInMs).toBe(0);
  });

  it("legacy project JSON without fade fields loads as 0", () => {
    const p = projectWith(
      [clip({ id: "c1", assetId: "a1", trackId: "A1", startMs: 0, durationMs: 500, gain: 0.8 })],
      [asset({ id: "a1", kind: "audio", durationMs: 500 })],
    );
    const raw = JSON.parse(serializeProject(p)) as { clips: Array<Record<string, unknown>> };
    delete raw.clips[0]!.fadeInMs;
    delete raw.clips[0]!.fadeOutMs;
    const loaded = deserializeProject(JSON.stringify(raw));
    expect(loaded.clips[0]!.fadeInMs).toBe(0);
    expect(loaded.clips[0]!.fadeOutMs).toBe(0);
    expect(loaded.clips[0]!.gain).toBe(0.8);
  });

  it("jobFromProject copies fades onto export clips", () => {
    const p = projectWith(
      [
        clip({
          id: "c1",
          assetId: "a1",
          trackId: "A1",
          startMs: 0,
          durationMs: 1000,
          fadeInMs: 120,
          fadeOutMs: 80,
        }),
      ],
      [asset({ id: "a1", kind: "audio", durationMs: 1000, objectUrl: "blob:t", missing: false })],
    );
    const job = jobFromProject(p);
    const exp = job.tracks.find((t) => t.id === "A1")!.clips[0]!;
    expect(exp.fadeInMs).toBe(120);
    expect(exp.fadeOutMs).toBe(80);
  });
});
