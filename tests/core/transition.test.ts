import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { createSession, type Session } from "../../src/app/session";
import { jobFromProject } from "../../src/core/exporter/job";
import { exportComposite } from "../../src/core/exporter/webcodecs";
import {
  compositeVideoAt,
  contextFromProject,
  resolveEditPair,
  transitionAudioGain,
  upsertTransition,
} from "../../src/core/transition";
import { previewComposite } from "../../src/ui/preview/Preview";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { asset, clip, projectWith } from "../helpers";

function stackedV1OverV2() {
  return projectWith(
    [
      clip({ id: "v1", assetId: "va", trackId: "V1", startMs: 0, durationMs: 2000, fadeInMs: 120 }),
      clip({ id: "v2", assetId: "vb", trackId: "V2", startMs: 1000, durationMs: 2000 }),
    ],
    [
      asset({ id: "va", kind: "video", name: "Outgoing", durationMs: 4000 }),
      asset({ id: "vb", kind: "video", name: "Incoming", durationMs: 4000 }),
    ],
  );
}

function stackedV2EndsFirst() {
  return projectWith(
    [
      clip({ id: "v1", assetId: "va", trackId: "V1", startMs: 0, durationMs: 3000 }),
      clip({ id: "v2", assetId: "vb", trackId: "V2", startMs: 500, durationMs: 1000 }),
    ],
    [
      asset({ id: "va", kind: "video", name: "Stay", durationMs: 4000 }),
      asset({ id: "vb", kind: "video", name: "Leave", durationMs: 4000 }),
    ],
  );
}

function sessionOf(project = stackedV1OverV2(), selected: string[] = ["v1"]): Session {
  return {
    ...createSession(createMemoryBlobStore()),
    project,
    selectedClipId: selected[0] ?? null,
    selectedClipIds: selected,
  };
}

describe("edit pair resolve", () => {
  it("V1→V2 and V2↑V1 resolve to the same outgoing/incoming pair", () => {
    const project = stackedV1OverV2();
    const fromV1 = resolveEditPair(project, ["v1"]);
    const fromV2 = resolveEditPair(project, ["v2"]);
    expect(fromV1?.sourceA.id).toBe("v1");
    expect(fromV1?.sourceB.id).toBe("v2");
    expect(fromV2?.sourceA.id).toBe("v1");
    expect(fromV2?.sourceB.id).toBe("v2");
    expect(fromV1?.overlapStartMs).toBe(1000);
    expect(fromV1?.overlapDurationMs).toBe(1000);
  });

  it("resolves V2↑V1 when V2 ends first", () => {
    const pair = resolveEditPair(stackedV2EndsFirst(), ["v1"]);
    expect(pair?.sourceA.id).toBe("v2");
    expect(pair?.sourceB.id).toBe("v1");
  });

  it("returns no pair without a stacked video overlap", () => {
    const project = projectWith(
      [clip({ id: "v1", assetId: "va", trackId: "V1", startMs: 0, durationMs: 500 })],
      [asset({ id: "va", kind: "video", durationMs: 500 })],
    );
    expect(resolveEditPair(project, ["v1"])).toBeUndefined();
  });
});

describe("compositeVideoAt", () => {
  function ctxWithType(type: "cut" | "crossfade" | "fadeBlack" | "fadeWhite") {
    const project = stackedV1OverV2();
    const { project: next } = upsertTransition(project, resolveEditPair(project, ["v1"])!, {
      type,
      durationMs: 1000,
      startMs: 1000,
    });
    return contextFromProject(next);
  }

  it("composites all four types at t in the window", () => {
    const mid = 1500;
    expect(compositeVideoAt(ctxWithType("cut"), mid)).toEqual({
      layers: [{ clipId: "v2", alpha: 1 }],
    });
    expect(compositeVideoAt(ctxWithType("crossfade"), mid)).toEqual({
      layers: [
        { clipId: "v1", alpha: 0.5 },
        { clipId: "v2", alpha: 0.5 },
      ],
    });
    const black = compositeVideoAt(ctxWithType("fadeBlack"), mid);
    expect(black.layers).toEqual([{ clipId: "v2", alpha: 0 }]);
    expect(black.plate).toEqual({ color: "#000000", alpha: 1 });
    const white = compositeVideoAt(ctxWithType("fadeWhite"), 1250);
    expect(white.layers[0]?.clipId).toBe("v1");
    expect(white.layers[0]?.alpha).toBeCloseTo(0.5);
    expect(white.plate).toEqual({ color: "#ffffff", alpha: 0.5 });
  });

  it("outside the window uses later-track stack order", () => {
    const ctx = ctxWithType("crossfade");
    expect(compositeVideoAt(ctx, 500).layers).toEqual([{ clipId: "v1", alpha: 1 }]);
    expect(compositeVideoAt(ctx, 2500).layers).toEqual([{ clipId: "v2", alpha: 1 }]);
  });
});

describe("preview and export compositor", () => {
  it("preview and export call the same function", () => {
    expect(previewComposite).toBe(exportComposite);
    expect(previewComposite).toBe(compositeVideoAt);
  });
});

describe("transition audio", () => {
  it("audioMode does not mutate clip.fadeInMs", () => {
    const start = sessionOf();
    const before = start.project.clips.find((c) => c.id === "v1")!.fadeInMs;
    const next = applyCommand(start, { type: "setTransition", audioMode: "crossfade", audioDurationMs: 400 });
    expect(next.project.clips.find((c) => c.id === "v1")!.fadeInMs).toBe(before);
    expect(next.project.clips.find((c) => c.id === "v1")!.fadeInMs).toBe(120);
    expect(next.project.transitions[0]?.audioMode).toBe("crossfade");
  });

  it("keepB mutes A in the video window without writing fades", () => {
    const project = stackedV1OverV2();
    const { project: next } = upsertTransition(project, resolveEditPair(project, ["v1"])!, {
      audioMode: "keepB",
      durationMs: 1000,
      startMs: 1000,
    });
    expect(transitionAudioGain(next.transitions, "v1", 1500, next)).toBe(0);
    expect(transitionAudioGain(next.transitions, "v2", 1500, next)).toBe(1);
    expect(next.clips.find((c) => c.id === "v1")!.fadeInMs).toBe(120);
  });
});

describe("export job consumes transitions", () => {
  it("copies transitions onto the job with start shifted by IN", () => {
    const project = { ...stackedV1OverV2(), inPointMs: 200, outPointMs: 2800 };
    const { project: withTr } = upsertTransition(project, resolveEditPair(project, ["v2"])!, {
      type: "crossfade",
      startMs: 1000,
      durationMs: 800,
    });
    const job = jobFromProject(withTr);
    expect(job.transitions).toHaveLength(1);
    expect(job.transitions![0]!.startMs).toBe(800);
    expect(job.transitions![0]!.type).toBe("crossfade");
  });
});
