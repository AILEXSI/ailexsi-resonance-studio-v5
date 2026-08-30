import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { createSession, type Session } from "../../src/app/session";
import { jobFromProject } from "../../src/core/exporter/job";
import { sourceTimeSec } from "../../src/core/exporter/frame-source";
import {
  clipRateOf,
  sourceTimeAt,
  timelineDurationForRate,
} from "../../src/core/models";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { deserializeProject, serializeProject } from "../../src/core/project";
import { placeAsset, setClipRate } from "../../src/core/timeline";
import { asset, clip, projectWith } from "../helpers";

function rateSession(): Session {
  const a = asset({ id: "aa", kind: "audio", durationMs: 4000 });
  const c = clip({
    id: "c1",
    assetId: "aa",
    trackId: "A1",
    startMs: 0,
    durationMs: 2000,
    sourceInMs: 0,
    sourceOutMs: 2000,
  });
  return {
    ...createSession(createMemoryBlobStore()),
    project: projectWith([c], [a]),
    selectedClipId: "c1",
    selectedClipIds: ["c1"],
  };
}

describe("clip rate defaults and math", () => {
  it("defaults to 1 and maps duration = sourceSpan / rate at 0.5 / 1 / 2", () => {
    expect(clipRateOf(clip({ id: "c", assetId: "a", trackId: "A1" }))).toBe(1);
    expect(timelineDurationForRate(2000, 1)).toBe(2000);
    expect(timelineDurationForRate(2000, 2)).toBe(1000);
    expect(timelineDurationForRate(2000, 0.5)).toBe(4000);
  });

  it("setClipRate keeps the source window and resizes timeline duration", () => {
    const start = rateSession();
    const half = setClipRate(start.project, "c1", 2);
    expect(half.error).toBeUndefined();
    const fast = half.project.clips[0]!;
    expect(fast.rate).toBe(2);
    expect(fast.durationMs).toBe(1000);
    expect(fast.sourceInMs).toBe(0);
    expect(fast.sourceOutMs).toBe(2000);

    const slow = setClipRate(start.project, "c1", 0.5);
    expect(slow.project.clips[0]!.durationMs).toBe(4000);
    expect(slow.project.clips[0]!.sourceOutMs).toBe(2000);
  });

  it("rejects a slower rate that would overlap the next clip", () => {
    const a = asset({ id: "aa", kind: "audio", durationMs: 4000 });
    const p = projectWith(
      [
        clip({
          id: "c1",
          assetId: "aa",
          trackId: "A1",
          startMs: 0,
          durationMs: 1000,
          sourceInMs: 0,
          sourceOutMs: 1000,
        }),
        clip({
          id: "c2",
          assetId: "aa",
          trackId: "A1",
          startMs: 1000,
          durationMs: 1000,
          sourceInMs: 0,
          sourceOutMs: 1000,
        }),
      ],
      [a],
    );
    const rejected = setClipRate(p, "c1", 0.5);
    expect(rejected.project).toBe(p);
    expect(rejected.error).toMatch(/overlap/i);
    expect(rejected.project.clips.find((c) => c.id === "c1")!.durationMs).toBe(1000);
    expect(rejected.project.clips.find((c) => c.id === "c1")!.rate).toBe(1);
  });

  it("speeding up that shrinks into a gap succeeds", () => {
    const a = asset({ id: "aa", kind: "audio", durationMs: 4000 });
    const p = projectWith(
      [
        clip({
          id: "c1",
          assetId: "aa",
          trackId: "A1",
          startMs: 0,
          durationMs: 1000,
          sourceInMs: 0,
          sourceOutMs: 1000,
        }),
        clip({
          id: "c2",
          assetId: "aa",
          trackId: "A1",
          startMs: 1000,
          durationMs: 500,
        }),
      ],
      [a],
    );
    const next = setClipRate(p, "c1", 2);
    expect(next.error).toBeUndefined();
    expect(next.project.clips.find((c) => c.id === "c1")!.durationMs).toBe(500);
    expect(next.project.clips.find((c) => c.id === "c2")!.startMs).toBe(1000);
  });
});

describe("setClipRate command + persist + clocks", () => {
  it("applyCommand setClipRate writes rate in one history entry", () => {
    const start = rateSession();
    const next = applyCommand(start, { type: "setClipRate", clipId: "c1", rate: 2 });
    expect(next.project.clips[0]!.rate).toBe(2);
    expect(next.project.clips[0]!.durationMs).toBe(1000);
    expect(next.history.past.length).toBe(start.history.past.length + 1);
    const undone = applyCommand(next, { type: "undo" });
    expect(undone.project.clips[0]!.rate).toBe(1);
    expect(undone.project.clips[0]!.durationMs).toBe(2000);
  });

  it("legacy project JSON without rate loads as 1", () => {
    const p = projectWith(
      [clip({ id: "c1", assetId: "a1", trackId: "A1", startMs: 0, durationMs: 500 })],
      [asset({ id: "a1", kind: "audio", durationMs: 500 })],
    );
    const raw = JSON.parse(serializeProject(p)) as { clips: Array<Record<string, unknown>> };
    delete raw.clips[0]!.rate;
    const loaded = deserializeProject(JSON.stringify(raw));
    expect(loaded.clips[0]!.rate).toBe(1);
  });

  it("placeAsset writes rate 1; sourceTimeAt and export clock use rate", () => {
    let project = projectWith([], [asset({ id: "a1", kind: "audio", durationMs: 2000 })]);
    const placed = placeAsset(project, "a1", "A1", 0);
    expect(placed.clip!.rate).toBe(1);
    const c = clip({
      id: "c",
      assetId: "a",
      trackId: "A1",
      startMs: 1000,
      durationMs: 500,
      sourceInMs: 200,
      sourceOutMs: 1200,
      rate: 2,
    });
    expect(sourceTimeAt(c, 1000)).toBe(200);
    expect(sourceTimeAt(c, 1250)).toBe(700);
    const job = jobFromProject(
      projectWith(
        [clip({ id: "c1", assetId: "a1", trackId: "A1", startMs: 0, durationMs: 500, rate: 2 })],
        [asset({ id: "a1", kind: "audio", durationMs: 2000, objectUrl: "blob:t", missing: false })],
      ),
    );
    const exp = job.tracks.find((t) => t.id === "A1")!.clips[0]!;
    expect(exp.rate).toBe(2);
    expect(sourceTimeSec(exp, 0, 30)).toBeCloseTo(0 + 500 / 30 / 1000, 5);
    expect(sourceTimeSec(exp, 250, 30)).toBeCloseTo((250 * 2 + 500 / 30) / 1000, 5);
  });
});
