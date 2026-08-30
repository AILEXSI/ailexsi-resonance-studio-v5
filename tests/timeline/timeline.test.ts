import { describe, expect, it } from "vitest";
import { applyInAt, applyOutAt, createSession } from "../../src/app/session";
import {
  SPLIT_EDGE_GUARD_MS,
  type Project,
} from "../../src/core/models";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { createEmptyProject } from "../../src/core/project";
import {
  clearInOut,
  createHistory,
  moveClip,
  moveInOut,
  pushHistory,
  redo,
  setInPoint,
  setOutPoint,
  snapTime,
  splitClipAt,
  rippleDeleteClip,
  rippleTrimClip,
  rollEdit,
  abuttingNeighbor,
  toggleTrackMute,
  toggleTrackSolo,
  trimClip,
  undo,
} from "../../src/core/timeline";
import { asset, clip, projectWith } from "../helpers";

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

describe("timeline trim", () => {
  it("trims in by 500ms on a 2000ms clip", () => {
    const result = trimClip(base(), "c1", "in", 1500);
    expect(result.error).toBeUndefined();
    const c = result.project.clips[0]!;
    expect(c.startMs).toBe(1500);
    expect(c.durationMs).toBe(1500);
    expect(c.sourceInMs).toBe(500);
    expect(c.sourceOutMs).toBe(2000);
  });

  it("trims out by 500ms and shrinks sourceOut", () => {
    const result = trimClip(base(), "c1", "out", 2500);
    expect(result.error).toBeUndefined();
    const c = result.project.clips[0]!;
    expect(c.startMs).toBe(1000);
    expect(c.durationMs).toBe(1500);
    expect(c.sourceInMs).toBe(0);
    expect(c.sourceOutMs).toBe(1500);
  });

  it("rejects trim that would leave less than 50ms", () => {
    const tooShortIn = trimClip(base(), "c1", "in", 2960);
    expect(tooShortIn.error).toMatch(/50ms/);
    expect(tooShortIn.project.clips[0]!.durationMs).toBe(2000);
    const tooShortOut = trimClip(base(), "c1", "out", 1040);
    expect(tooShortOut.error).toMatch(/50ms/);
    expect(tooShortOut.project.clips[0]!.durationMs).toBe(2000);
  });

  it("rejects sourceIn below 0", () => {
    const result = trimClip(base(), "c1", "in", 500);
    expect(result.error).toMatch(/sourceIn/);
    expect(result.project.clips[0]!.sourceInMs).toBe(0);
    expect(result.project.clips[0]!.startMs).toBe(1000);
  });

  it("rejects sourceOut past asset duration", () => {
    const p = projectWith(
      [clip({ id: "c1", assetId: "a", trackId: "V1", startMs: 1000, durationMs: 2000, sourceInMs: 0, sourceOutMs: 2000 })],
      [asset({ id: "a", kind: "video", durationMs: 2000 })],
    );
    const result = trimClip(p, "c1", "out", 3500);
    expect(result.error).toMatch(/asset duration/);
    expect(result.project.clips[0]!.sourceOutMs).toBe(2000);
    expect(result.project.clips[0]!.durationMs).toBe(2000);
  });

  it("clears IN/OUT points", () => {
    const p = { ...base(), inPointMs: 200, outPointMs: 800 };
    const cleared = clearInOut(p);
    expect(cleared.inPointMs).toBeNull();
    expect(cleared.outPointMs).toBeNull();
  });
});

describe("timeline mute", () => {
  it("toggles track muted flag", () => {
    const p = base();
    expect(p.tracks.find((t) => t.id === "V1")!.muted).toBe(false);
    const muted = toggleTrackMute(p, "V1");
    expect(muted.tracks.find((t) => t.id === "V1")!.muted).toBe(true);
    const unmuted = toggleTrackMute(muted, "V1");
    expect(unmuted.tracks.find((t) => t.id === "V1")!.muted).toBe(false);
  });
});

describe("ripple delete", () => {
  it("removes the clip and shifts later clips on the same track only", () => {
    const a = asset({ id: "a", kind: "audio", durationMs: 2000 });
    const p = projectWith(
      [
        clip({ id: "c1", assetId: "a", trackId: "A1", startMs: 0, durationMs: 1000 }),
        clip({ id: "c2", assetId: "a", trackId: "A1", startMs: 1000, durationMs: 500 }),
        clip({ id: "c3", assetId: "a", trackId: "A2", startMs: 1000, durationMs: 400 }),
      ],
      [a],
    );
    const next = rippleDeleteClip(p, "c1");
    expect(next.clips.find((c) => c.id === "c1")).toBeUndefined();
    expect(next.clips.find((c) => c.id === "c2")!.startMs).toBe(0);
    expect(next.clips.find((c) => c.id === "c3")!.startMs).toBe(1000);
  });
});

function abuttingA1(): ReturnType<typeof projectWith> {
  const a = asset({ id: "a", kind: "audio", durationMs: 2000 });
  return {
    ...projectWith(
      [
        clip({
          id: "c1",
          assetId: "a",
          trackId: "A1",
          startMs: 0,
          durationMs: 1000,
          sourceInMs: 0,
          sourceOutMs: 1000,
        }),
        clip({
          id: "c2",
          assetId: "a",
          trackId: "A1",
          startMs: 1000,
          durationMs: 1000,
          sourceInMs: 0,
          sourceOutMs: 1000,
        }),
        clip({
          id: "c3",
          assetId: "a",
          trackId: "A2",
          startMs: 1000,
          durationMs: 800,
        }),
      ],
      [a],
    ),
    snap: false,
  };
}

describe("ripple trim", () => {
  it("ripple-trims first out to 800 and pulls the later A1 clip; lift-trim does not", () => {
    const p = abuttingA1();
    const lifted = trimClip(p, "c1", "out", 800);
    expect(lifted.error).toBeUndefined();
    expect(lifted.project.clips.find((c) => c.id === "c1")!.durationMs).toBe(800);
    expect(lifted.project.clips.find((c) => c.id === "c2")!.startMs).toBe(1000);

    const rippled = rippleTrimClip(p, "c1", "out", 800);
    expect(rippled.error).toBeUndefined();
    expect(rippled.project.clips.find((c) => c.id === "c1")!.durationMs).toBe(800);
    expect(rippled.project.clips.find((c) => c.id === "c2")!.startMs).toBe(800);
    expect(rippled.project.clips.find((c) => c.id === "c3")!.startMs).toBe(1000);
  });

  it("keeps the 50ms edge guard", () => {
    const p = abuttingA1();
    const rejected = rippleTrimClip(p, "c1", "out", 40);
    expect(rejected.error).toMatch(/50ms/);
    expect(rejected.project.clips.find((c) => c.id === "c2")!.startMs).toBe(1000);
  });
});

describe("roll edit", () => {
  it("rolls the shared cut +200 and keeps the A+B span", () => {
    const p = abuttingA1();
    expect(abuttingNeighbor(p, "c1", "out")?.id).toBe("c2");
    const rolled = rollEdit(p, "c1", "c2", 1200);
    expect(rolled.error).toBeUndefined();
    const a = rolled.project.clips.find((c) => c.id === "c1")!;
    const b = rolled.project.clips.find((c) => c.id === "c2")!;
    expect(a.startMs).toBe(0);
    expect(a.durationMs).toBe(1200);
    expect(a.sourceOutMs).toBe(1200);
    expect(b.startMs).toBe(1200);
    expect(b.durationMs).toBe(800);
    expect(b.sourceInMs).toBe(200);
    expect(a.startMs + a.durationMs + b.durationMs).toBe(2000);
    expect(rolled.project.clips.find((c) => c.id === "c3")!.startMs).toBe(1000);
  });

  it("rejects a roll that would leave less than 50ms", () => {
    const p = abuttingA1();
    const rejected = rollEdit(p, "c1", "c2", 40);
    expect(rejected.error).toMatch(/50ms/);
    expect(rejected.project.clips.find((c) => c.id === "c1")!.durationMs).toBe(1000);
    expect(rejected.project.clips.find((c) => c.id === "c2")!.startMs).toBe(1000);
  });
});

describe("track solo", () => {
  it("toggles solo independently of mute", () => {
    const p = base();
    expect(p.tracks.find((t) => t.id === "A1")!.solo).toBe(false);
    const soloed = toggleTrackSolo(p, "A1");
    expect(soloed.tracks.find((t) => t.id === "A1")!.solo).toBe(true);
    expect(soloed.tracks.find((t) => t.id === "A1")!.muted).toBe(false);
    const unsoloed = toggleTrackSolo(soloed, "A1");
    expect(unsoloed.tracks.find((t) => t.id === "A1")!.solo).toBe(false);
  });
});

function rightClickSequence(t1: number, t2: number) {
  const session = createSession(createMemoryBlobStore());
  return applyOutAt(applyInAt(session, t1), t2);
}

describe("loop range", () => {
  it("sets IN then OUT via rightClickSequence; second < first swaps", () => {
    const ordered = rightClickSequence(1000, 3000);
    expect(ordered.project.inPointMs).toBe(1000);
    expect(ordered.project.outPointMs).toBe(3000);
    expect(ordered.project.loop).toBe(true);
    expect(ordered.error).toBeNull();

    const swapped = rightClickSequence(3000, 1000);
    expect(swapped.project.inPointMs).toBe(1000);
    expect(swapped.project.outPointMs).toBe(3000);
    expect(swapped.project.loop).toBe(true);
    expect(swapped.error).toBeNull();
  });

  it("moveInOut +200ms keeps duration", () => {
    const ranged = rightClickSequence(200, 800);
    const moved = moveInOut(ranged.project, 200);
    expect(moved.error).toBeUndefined();
    expect(moved.project.inPointMs).toBe(400);
    expect(moved.project.outPointMs).toBe(1000);
  });

  it("IN cannot go below 0 when dragging", () => {
    const ranged = rightClickSequence(100, 500);
    const moved = moveInOut(ranged.project, -400);
    expect(moved.error).toBeUndefined();
    expect(moved.project.inPointMs).toBe(0);
    expect(moved.project.outPointMs).toBe(400);
  });
});
