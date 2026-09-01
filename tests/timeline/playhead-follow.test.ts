import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import {
  applyPlayhead,
  applyToggleFollow,
  applyTimelineViewport,
  createSession,
  type Session,
} from "../../src/app/session";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { FRAME_MS } from "../../src/core/models";
import { playheadInView, visibleDurationMs } from "../../src/core/zoom";
import { asset, clip, projectWith } from "../helpers";

const LANE = 1000;

function zoomedSession(): Session {
  const a = asset({ id: "wav", kind: "audio", durationMs: 120_000, name: "long.wav" });
  const c = clip({ id: "c1", assetId: "wav", trackId: "A1", startMs: 0, durationMs: 120_000 });
  return {
    ...createSession(createMemoryBlobStore()),
    timelineWidthPx: LANE,
    project: { ...projectWith([c], [a]), zoomPxPerSec: 200, scrollMs: 0, playheadMs: 0 },
  };
}

describe("playhead follow (P46)", () => {
  it("applyPlayhead pages scroll when the needle leaves the view", () => {
    const start = zoomedSession();
    expect(playheadInView(30_000, 0, 200, LANE)).toBe(false);
    const next = applyPlayhead(start, 30_000);
    expect(next.project.playheadMs).toBe(30_000);
    expect(next.project.scrollMs).toBeGreaterThan(0);
    expect(playheadInView(30_000, next.project.scrollMs, 200, LANE)).toBe(true);
    expect(next.history.past.length).toBe(start.history.past.length);
    const visible = visibleDurationMs(200, LANE);
    expect(next.project.scrollMs).toBeCloseTo(30_000 - visible, 5);
  });

  it("leaves scroll alone when the playhead is already visible", () => {
    const start = zoomedSession();
    const next = applyPlayhead(start, 500);
    expect(next.project.playheadMs).toBe(500);
    expect(next.project.scrollMs).toBe(0);
  });

  it("goto next/prev edit follows; Follow off does not scroll", () => {
    const start = zoomedSession();
    start.project = {
      ...start.project,
      playheadMs: 0,
      markers: [{ id: "m1", timeMs: 40_000, label: "far" }],
    };
    const jumped = applyCommand(start, { type: "gotoNextEdit" });
    expect(jumped.project.playheadMs).toBe(40_000);
    expect(playheadInView(40_000, jumped.project.scrollMs, 200, LANE)).toBe(true);

    const off = applyToggleFollow(start);
    expect(off.followPlayhead).toBe(false);
    const stayed = applyCommand(off, { type: "gotoNextEdit" });
    expect(stayed.project.playheadMs).toBe(40_000);
    expect(stayed.project.scrollMs).toBe(0);
    expect(playheadInView(40_000, 0, 200, LANE)).toBe(false);
  });

  it("frame-step snaps toward nearby edges, not back onto itself (P88)", () => {
    const start = zoomedSession();
    start.project = {
      ...start.project,
      playheadMs: 1930,
      snap: true,
      markers: [{ id: "m1", timeMs: 2000, label: "M" }],
    };
    const snapped = applyCommand(start, { type: "nudgePlayhead", deltaMs: FRAME_MS });
    expect(snapped.project.playheadMs).toBe(2000);

    const off = applyCommand(
      { ...start, project: { ...start.project, snap: false } },
      { type: "nudgePlayhead", deltaMs: FRAME_MS },
    );
    expect(off.project.playheadMs).toBeCloseTo(1930 + FRAME_MS, 5);

    const leave = applyCommand(snapped, { type: "nudgePlayhead", deltaMs: FRAME_MS });
    expect(leave.project.playheadMs).toBeCloseTo(2000 + FRAME_MS, 5);

    const exact = applyPlayhead(start, 1966);
    expect(exact.project.playheadMs).toBe(1966);
  });

  it("viewport report is view-state only", () => {
    const start = zoomedSession();
    const past = start.history.past.length;
    const next = applyTimelineViewport(start, 800, 80);
    expect(next.timelineWidthPx).toBe(800);
    expect(next.timelineLaneLabelPx).toBe(80);
    expect(next.history.past.length).toBe(past);
    expect(applyTimelineViewport(next, 800, 80)).toBe(next);
  });
});
