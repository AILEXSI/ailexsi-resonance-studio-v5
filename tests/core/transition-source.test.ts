import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/app/commands";
import { createSession, type Session } from "../../src/app/session";
import { jobFromProject } from "../../src/core/exporter/job";
import { exportComposite } from "../../src/core/exporter/webcodecs";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { deserializeProject, serializeProject } from "../../src/core/project";
import {
  compositeVideoAt,
  contextFromProject,
  formatResolvedSource,
  resolvePictureSource,
  upsertTransition,
} from "../../src/core/transition";
import { previewComposite } from "../../src/ui/preview/Preview";
import { shouldShowVisualizer } from "../../src/core/visualizer";
import { asset, clip, projectWith } from "../helpers";

function stacked(front: "V1" | "V2" = "V2") {
  const project = projectWith(
    [
      clip({ id: "v1", assetId: "va", trackId: "V1", startMs: 0, durationMs: 2000 }),
      clip({ id: "v2", assetId: "vb", trackId: "V2", startMs: 0, durationMs: 2000 }),
    ],
    [
      asset({ id: "va", kind: "video", durationMs: 4000 }),
      asset({ id: "vb", kind: "video", durationMs: 4000 }),
    ],
  );
  project.frontVideoTrackId = front;
  project.playheadMs = 500;
  return project;
}

function sessionOf(project = stacked(), selected: string[] = ["v1", "v2"]): Session {
  return {
    ...createSession(createMemoryBlobStore()),
    project,
    selectedClipId: selected[0] ?? null,
    selectedClipIds: selected,
  };
}

describe("transition source AUTO", () => {
  it("VIS event + covering video → video wins (VIS only fills gaps)", () => {
    const project = stacked();
    project.visualizer = {
      ...project.visualizer,
      events: [{ id: "ve1", sceneId: "pulse-orb", startMs: 0, durationMs: 1000 }],
    };
    const picture = resolvePictureSource(contextFromProject(project), 500);
    expect(picture).toMatchObject({ source: "auto", kind: "V2", clipId: "v2" });
    expect(shouldShowVisualizer(project, 500)).toBe(false);
    expect(formatResolvedSource(picture)).toBe("AUTO→V2");
  });

  it("VIS event + no video → vis", () => {
    const project = stacked();
    project.clips = [];
    project.visualizer = {
      ...project.visualizer,
      events: [{ id: "ve1", sceneId: "pulse-orb", startMs: 0, durationMs: 1000 }],
    };
    const picture = resolvePictureSource(contextFromProject(project), 500);
    expect(picture).toMatchObject({ source: "auto", kind: "vis" });
    expect(shouldShowVisualizer(project, 500)).toBe(true);
    expect(formatResolvedSource(picture)).toBe("AUTO→VIS");
  });

  it("no VIS, front V2 covering → V2", () => {
    const project = stacked("V2");
    const picture = resolvePictureSource(contextFromProject(project), 500);
    expect(picture).toMatchObject({ source: "auto", kind: "V2", clipId: "v2" });
    expect(compositeVideoAt(contextFromProject(project), 500).layers).toEqual([
      { clipId: "v2", alpha: 1 },
    ]);
    expect(formatResolvedSource(picture)).toBe("AUTO→V2");
  });

  it("V2 empty, V1 covering → V1", () => {
    const project = stacked("V2");
    project.clips = project.clips.filter((c) => c.id !== "v2");
    const emptyV2 = resolvePictureSource(contextFromProject(project), 500);
    expect(emptyV2).toMatchObject({ source: "auto", kind: "V1", clipId: "v1" });
  });

  it("muted V2 still covers picture; mute is audio-only", () => {
    const muted = stacked("V2");
    muted.tracks = muted.tracks.map((t) => (t.id === "V2" ? { ...t, muted: true } : t));
    const mutedV2 = resolvePictureSource(contextFromProject(muted), 500);
    expect(mutedV2).toMatchObject({ source: "auto", kind: "V2", clipId: "v2" });
    expect(compositeVideoAt(contextFromProject(muted), 500).layers).toEqual([
      { clipId: "v2", alpha: 1 },
    ]);
  });

  it("none → black", () => {
    const project = stacked();
    project.clips = [];
    project.visualizer = { ...project.visualizer, enabled: false };
    const picture = resolvePictureSource(contextFromProject(project), 500);
    expect(picture).toMatchObject({ source: "auto", kind: "black" });
    expect(formatResolvedSource(picture)).toBe("AUTO→BLACK");
    expect(compositeVideoAt(contextFromProject(project), 500).layers).toEqual([]);
  });
});
