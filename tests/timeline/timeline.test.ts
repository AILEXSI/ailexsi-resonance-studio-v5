import { describe, expect, it } from "vitest";
import {
  SPLIT_EDGE_GUARD_MS,
  type Project,
} from "../../src/core/models";
import { createEmptyProject } from "../../src/core/project";
import {
  createHistory,
  moveClip,
  pushHistory,
  redo,
  setInPoint,
  setOutPoint,
  snapTime,
  splitClipAt,
  undo,
} from "../../src/core/timeline";
import { clip, projectWith } from "../helpers";

function base(): Project {
  return projectWith([
    clip({ id: "c1", assetId: "a", trackId: "V1", startMs: 1000, durationMs: 2000, sourceInMs: 0, sourceOutMs: 2000 }),
  ]);
}

describe("timeline move/split/snap/undo", () => {
  it("moves a clip and clamps before 0", () => {
    const moved = moveClip(base(), "c1", 2500);
    expect(moved.project.clips[0]!.startMs).toBe(2500);
    const clamped = moveClip(base(), "c1", -400);
    expect(clamped.project.clips[0]!.startMs).toBe(0);
    expect(clamped.error).toBeUndefined();
  });

  it("rejects move to a different kind", () => {
    const result = moveClip(base(), "c1", 0, "A1");
    expect(result.error).toMatch(/different kind/);
    expect(result.project.clips[0]!.trackId).toBe("V1");
  });

  it("allows V1 to V2", () => {
    const result = moveClip(base(), "c1", 1000, "V2");
    expect(result.error).toBeUndefined();
    expect(result.project.clips[0]!.trackId).toBe("V2");
  });

  it("splits a clip and keeps source ranges", () => {
    const result = splitClipAt(base(), "c1", 1800);
    expect(result.error).toBeUndefined();
    expect(result.project.clips).toHaveLength(2);
    const [left, right] = result.project.clips;
    expect(left!.durationMs).toBe(800);
    expect(left!.sourceOutMs).toBe(800);
    expect(right!.startMs).toBe(1800);
    expect(right!.sourceInMs).toBe(800);
    expect(right!.durationMs).toBe(1200);
  });

  it("rejects split near edges", () => {
    const nearStart = splitClipAt(base(), "c1", 1000 + SPLIT_EDGE_GUARD_MS - 1);
    expect(nearStart.error).toMatch(/edge/);
    const nearEnd = splitClipAt(base(), "c1", 3000 - SPLIT_EDGE_GUARD_MS + 1);
    expect(nearEnd.error).toMatch(/edge/);
    expect(nearStart.project.clips).toHaveLength(1);
  });

  it("snaps to nearby targets", () => {
    const snapped = snapTime(97, [{ timeMs: 100, kind: "clip-start" }], 20);
    expect(snapped.snapped).toBe(true);
    expect(snapped.timeMs).toBe(100);
    const not = snapTime(200, [{ timeMs: 100, kind: "zero" }], 20);
    expect(not.snapped).toBe(false);
  });

  it("undo/redo restores clip position", () => {
    const start = base();
    let history = createHistory();
    history = pushHistory(history, start);
    const moved = moveClip(start, "c1", 4000).project;
    const undone = undo(history, moved);
    expect(undone?.project.clips[0]!.startMs).toBe(1000);
    const redone = redo(undone!.history, undone!.project);
    expect(redone?.project.clips[0]!.startMs).toBe(4000);
  });

  it("rejects IN after OUT", () => {
    const p = { ...createEmptyProject(), outPointMs: 1000 };
    expect(setInPoint(p, 1500).error).toMatch(/IN cannot/);
    expect(setOutPoint({ ...createEmptyProject(), inPointMs: 2000 }, 500).error).toMatch(/OUT cannot/);
  });
});
