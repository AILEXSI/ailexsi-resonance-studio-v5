import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { createSession, type Session } from "../../src/app/session";
import { FRAME_MS } from "../../src/core/models";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { nextShuttleRate } from "../../src/core/playback";
import { asset, clip, projectWith } from "../helpers";

function twoClipSession(): Session {
  const a = asset({ id: "aa", kind: "audio", durationMs: 2000 });
  const first = clip({
    id: "c1",
    assetId: "aa",
    trackId: "A1",
    startMs: 0,
    durationMs: 1000,
  });
  const second = clip({
    id: "c2",
    assetId: "aa",
    trackId: "A1",
    startMs: 1000,
    durationMs: 500,
  });
  const other = clip({
    id: "c3",
    assetId: "aa",
    trackId: "A2",
    startMs: 1000,
    durationMs: 400,
  });
  return {
    ...createSession(createMemoryBlobStore()),
    project: projectWith([first, second, other], [a]),
    selectedClipId: "c1",
  };
}

function clipStarts(session: Session): Record<string, number> {
  return Object.fromEntries(session.project.clips.map((c) => [c.id, c.startMs]));
}

describe("applyCommand determinism", () => {
  it("same session+command yields the same clips, tracks, and shuttleRate", () => {
    const start = twoClipSession();
    const commands = [
      { type: "rippleDelete" } as const,
      { type: "nudgeClip", deltaMs: FRAME_MS } as const,
      { type: "toggleSolo", trackId: "A1" } as const,
      { type: "shuttle", dir: 1 } as const,
      { type: "liftDelete" } as const,
      { type: "rippleTrim", clipId: "c1", edge: "out", nextEdgeMs: 800 } as const,
    ];
    for (const command of commands) {
      const a = applyCommand(start, command);
      const b = applyCommand(start, command);
      expect(clipStarts(a)).toEqual(clipStarts(b));
      expect(a.project.tracks.map((t) => ({ id: t.id, solo: t.solo, muted: t.muted }))).toEqual(
        b.project.tracks.map((t) => ({ id: t.id, solo: t.solo, muted: t.muted })),
      );
      expect(a.shuttleRate).toBe(b.shuttleRate);
      expect(a.playing).toBe(b.playing);
      expect(a.selectedClipId).toBe(b.selectedClipId);
    }
  });

  it("ripple-deletes A1@0 and shifts the later A1 clip; A2 is unchanged", () => {
    const next = applyCommand(twoClipSession(), { type: "rippleDelete" });
    expect(next.project.clips.find((c) => c.id === "c1")).toBeUndefined();
    expect(next.project.clips.find((c) => c.id === "c2")!.startMs).toBe(0);
    expect(next.project.clips.find((c) => c.id === "c3")!.startMs).toBe(1000);
    expect(next.selectedClipId).toBeNull();
  });

  it("undo restores a ripple delete", () => {
    const start = twoClipSession();
    const deleted = applyCommand(start, { type: "rippleDelete" });
    const undone = applyCommand(deleted, { type: "undo" });
    expect(clipStarts(undone)).toEqual(clipStarts(start));
    expect(undone.project.clips).toHaveLength(3);
  });

  it("ripple-trims first out and pulls the later A1 clip; lift-trim does not", () => {
    const start = twoClipSession();
    start.project = { ...start.project, snap: false };
    const lifted = applyCommand(start, { type: "liftTrim", clipId: "c1", edge: "out", nextEdgeMs: 800 });
    expect(lifted.project.clips.find((c) => c.id === "c2")!.startMs).toBe(1000);
    const rippled = applyCommand(start, { type: "rippleTrim", clipId: "c1", edge: "out", nextEdgeMs: 800 });
    expect(rippled.project.clips.find((c) => c.id === "c1")!.durationMs).toBe(800);
    expect(rippled.project.clips.find((c) => c.id === "c2")!.startMs).toBe(800);
    expect(rippled.project.clips.find((c) => c.id === "c3")!.startMs).toBe(1000);
    const undone = applyCommand(rippled, { type: "undo" });
    expect(clipStarts(undone)).toEqual(clipStarts(start));
  });

  it("rolls an abutting cut +200 and undo restores both clips", () => {
    const a = asset({ id: "aa", kind: "audio", durationMs: 2000 });
    const start: Session = {
      ...createSession(createMemoryBlobStore()),
      project: {
        ...projectWith(
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
        ),
        snap: false,
      },
      selectedClipId: "c1",
    };
    const rolled = applyCommand(start, { type: "rollEdit", clipId: "c1", edge: "out", nextEdgeMs: 1200 });
    expect(rolled.project.clips.find((c) => c.id === "c1")!.durationMs).toBe(1200);
    expect(rolled.project.clips.find((c) => c.id === "c2")!.startMs).toBe(1200);
    expect(rolled.project.clips.find((c) => c.id === "c2")!.durationMs).toBe(800);
    const undone = applyCommand(rolled, { type: "undo" });
    expect(undone.project.clips.find((c) => c.id === "c1")!.durationMs).toBe(1000);
    expect(undone.project.clips.find((c) => c.id === "c2")!.startMs).toBe(1000);
  });

  it("nudge moves startMs by FRAME_MS and clamps at 0", () => {
    const start = twoClipSession();
    const right = applyCommand(start, { type: "nudgeClip", deltaMs: FRAME_MS });
    expect(right.project.clips.find((c) => c.id === "c1")!.startMs).toBe(FRAME_MS);
    expect(right.project.clips.find((c) => c.id === "c1")!.trackId).toBe("A1");

    const left = applyCommand(start, { type: "nudgeClip", deltaMs: -FRAME_MS });
    expect(left.project.clips.find((c) => c.id === "c1")!.startMs).toBe(0);

    const ten = applyCommand(right, { type: "nudgeClip", deltaMs: -10 * FRAME_MS });
    expect(ten.project.clips.find((c) => c.id === "c1")!.startMs).toBe(0);
  });
});

describe("shuttle rate table", () => {
  it("L steps 0 → 1 → 2 → 4 and caps; J is the reverse; K is 0", () => {
    expect(nextShuttleRate(0, 1)).toBe(1);
    expect(nextShuttleRate(1, 1)).toBe(2);
    expect(nextShuttleRate(2, 1)).toBe(4);
    expect(nextShuttleRate(4, 1)).toBe(4);
    expect(nextShuttleRate(-2, 1)).toBe(1);

    expect(nextShuttleRate(0, -1)).toBe(-1);
    expect(nextShuttleRate(-1, -1)).toBe(-2);
    expect(nextShuttleRate(-2, -1)).toBe(-4);
    expect(nextShuttleRate(-4, -1)).toBe(-4);
    expect(nextShuttleRate(2, -1)).toBe(-1);

    expect(nextShuttleRate(4, 0)).toBe(0);
    expect(nextShuttleRate(-4, 0)).toBe(0);
  });

  it("applyCommand shuttle matches the rate table and Space resets to 1x", () => {
    let s = twoClipSession();
    s = applyCommand(s, { type: "shuttle", dir: 1 });
    expect(s.shuttleRate).toBe(1);
    expect(s.playing).toBe(true);
    s = applyCommand(s, { type: "shuttle", dir: 1 });
    expect(s.shuttleRate).toBe(2);
    s = applyCommand(s, { type: "shuttle", dir: 1 });
    expect(s.shuttleRate).toBe(4);
    s = applyCommand(s, { type: "shuttle", dir: 0 });
    expect(s.shuttleRate).toBe(0);
    expect(s.playing).toBe(false);
    s = applyCommand(s, { type: "playPause" });
    expect(s.shuttleRate).toBe(1);
    expect(s.playing).toBe(true);
    s = applyCommand(s, { type: "playPause" });
    expect(s.shuttleRate).toBe(0);
    expect(s.playing).toBe(false);
  });
});
