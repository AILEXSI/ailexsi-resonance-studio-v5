import { describe, expect, it } from "vitest";
import { applyCycleVisualizerScene, createSession, type Session } from "../../src/app/session";
import { DEFAULT_VISUALIZER_SCENE_ID, VISUALIZER_SCENE_IDS } from "../../src/core/models";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { createEmptyProject } from "../../src/core/project";
import { jobFromProject } from "../../src/core/exporter/job";
import {
  insertCueAtPlayhead,
  nextSceneId,
  sceneAt,
  sceneIdAt,
  visualizerEventsOf,
} from "../../src/core/visualizer";
import { clip, projectWith } from "../helpers";

function sessionOf(project = createEmptyProject("Cues")): Session {
  return {
    ...createSession(createMemoryBlobStore()),
    project,
  };
}

describe("VIS cues", () => {
  it("playhead mid then VIS cycle inserts two abutting blocks (left old, right next)", () => {
    const project = createEmptyProject("Cues");
    project.playheadMs = 2000;
    const next = applyCycleVisualizerScene(sessionOf(project));
    const events = visualizerEventsOf(next.project).sort((a, b) => a.startMs - b.startMs);
    expect(events).toHaveLength(2);
    expect(events[0]!.startMs).toBe(0);
    expect(events[0]!.durationMs).toBe(2000);
    expect(events[0]!.sceneId).toBe(DEFAULT_VISUALIZER_SCENE_ID);
    expect(events[1]!.startMs).toBe(2000);
    expect(events[1]!.sceneId).toBe("tunnel-spiral");
    expect(next.project.visualizer.cues).toEqual([
      { startMs: 0, sceneId: DEFAULT_VISUALIZER_SCENE_ID },
      { startMs: 2000, sceneId: "tunnel-spiral" },
    ]);
    expect(sceneAt(next.project, 1999)).toBe(DEFAULT_VISUALIZER_SCENE_ID);
    expect(sceneAt(next.project, 2000)).toBe("tunnel-spiral");
    expect(sceneIdAt(next.project, 2000)).toBe("tunnel-spiral");
    expect(next.selectedVisEventId).toBe(events[1]!.id);
  });

  it("sceneAt / sceneIdAt follow cues when events are empty", () => {
    const project = createEmptyProject("Cues");
    project.visualizer = {
      ...project.visualizer,
      cues: [
        { startMs: 0, sceneId: "pulse-orb" },
        { startMs: 1500, sceneId: "aurora-veil" },
      ],
    };
    expect(sceneAt(project, 0)).toBe("pulse-orb");
    expect(sceneAt(project, 1499)).toBe("pulse-orb");
    expect(sceneIdAt(project, 1500)).toBe("aurora-veil");
  });

  it("rematerialized events ride the existing export compositor (no exporter rebuild)", () => {
    const project = projectWith([clip({ id: "a1", assetId: "a", trackId: "A1", startMs: 0, durationMs: 8000 })]);
    project.playheadMs = 3000;
    const { project: cued } = insertCueAtPlayhead(project, 3000);
    const job = jobFromProject(cued);
    const events = [...(job.visualizer.events ?? [])].sort((a, b) => a.startMs - b.startMs);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]!.sceneId).toBe(DEFAULT_VISUALIZER_SCENE_ID);
    expect(events.some((e) => e.startMs === 3000 && e.sceneId === "tunnel-spiral")).toBe(true);
  });

  it("nextSceneId walks the 12-id cycle including the four already-shipped scenes", () => {
    expect(VISUALIZER_SCENE_IDS).toContain("particle-field");
    expect(VISUALIZER_SCENE_IDS).toContain("resonance-wave");
    expect(VISUALIZER_SCENE_IDS).toContain("tunnel-spiral");
    expect(VISUALIZER_SCENE_IDS).toContain("lita-bloom");
    expect(nextSceneId("ember-rain")).toBe("particle-field");
    expect(nextSceneId("particle-field")).toBe("resonance-wave");
    expect(nextSceneId("lita-bloom")).toBe("spectrum-bars");
  });
});
