import { describe, expect, it } from "vitest";
import { createMemoryBlobStore, hydrateProject, persistAssetBlob } from "../../src/core/persistence";
import { deserializeProject, serializeProject, createEmptyProject } from "../../src/core/project";
import { placeAsset } from "../../src/core/timeline";
import { asset, clip, projectWith } from "../helpers";

describe("project persist + reload", () => {
  it("serializes without durable blob URLs", () => {
    const p = projectWith(
      [clip({ id: "c1", assetId: "a1", trackId: "V1", startMs: 0, durationMs: 500 })],
      [asset({ id: "a1", kind: "video", objectUrl: "blob:http://localhost/abc", missing: false })],
    );
    p.inPointMs = 100;
    p.outPointMs = 400;
    const json = serializeProject(p);
    expect(json).not.toContain("blob:http");
    const loaded = deserializeProject(json);
    expect(loaded.assets[0]!.missing).toBe(true);
    expect(loaded.assets[0]!.objectUrl).toBeUndefined();
    expect(loaded.clips[0]!.startMs).toBe(0);
    expect(loaded.inPointMs).toBe(100);
    expect(loaded.outPointMs).toBe(400);
    expect(loaded.assets[0]!.blobId).toBe("a1");
  });

  it("hydrates blobs from the store and marks missing otherwise", async () => {
    const store = createMemoryBlobStore();
    const media = asset({ id: "keep", kind: "audio", durationMs: 900, missing: true });
    await persistAssetBlob(store, media, new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }));
    const ghost = asset({ id: "gone", kind: "video", blobId: "nope", missing: true });
    const project = projectWith([], [media, ghost]);
    const hydrated = await hydrateProject(project, store);
    expect(hydrated.assets[0]!.missing).toBe(false);
    expect(hydrated.assets[1]!.missing).toBe(true);
  });

  it("round-trips import → asset → clip → serialize → deserialize", async () => {
    const store = createMemoryBlobStore();
    const media = asset({ id: "a1", kind: "audio", durationMs: 1200 });
    await persistAssetBlob(store, media, new Blob(["wav"], { type: "audio/wav" }));
    let project = { ...createEmptyProject("Song"), assets: [media] };
    const placed = placeAsset(project, "a1", "A2", 250);
    project = placed.project;
    const again = deserializeProject(serializeProject(project));
    const hydrated = await hydrateProject(again, store);
    expect(hydrated.clips[0]!.trackId).toBe("A2");
    expect(hydrated.clips[0]!.startMs).toBe(250);
    expect(hydrated.assets[0]!.missing).toBe(false);
  });

  it("rejects unknown schema", () => {
    expect(() => deserializeProject(JSON.stringify({ schemaVersion: 4, id: "x", name: "old" }))).toThrow(
      /schemaVersion/,
    );
  });
});
