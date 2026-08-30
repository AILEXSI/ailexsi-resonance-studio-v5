import { describe, expect, it } from "vitest";
import { dispatchEditorKey } from "../../src/app/keys";
import { createSession, type Session } from "../../src/app/session";
import { projectDurationMs } from "../../src/core/models";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { asset, clip, projectWith } from "../helpers";

function sessionOf(action: ReturnType<typeof dispatchEditorKey>): Session {
  expect(action.type).toBe("session");
  if (action.type !== "session") throw new Error("expected session");
  return action.session;
}

function clipSession(): Session {
  const a = asset({ id: "a", kind: "audio", durationMs: 8000 });
  const c = clip({ id: "c1", assetId: "a", trackId: "A1", startMs: 1000, durationMs: 4000 });
  return {
    ...createSession(createMemoryBlobStore()),
    project: { ...projectWith([c], [a]), playheadMs: 2500 },
  };
}

describe("Home / End seek (P49)", () => {
  it("Home seeks to 0 via applyPlayhead", () => {
    const start = clipSession();
    const next = sessionOf(dispatchEditorKey(start, false, { key: "Home" }));
    expect(next.project.playheadMs).toBe(0);
    expect(next.history.past.length).toBe(start.history.past.length);
    const home = dispatchEditorKey(start, false, { key: "Home" });
    expect(home.type).toBe("session");
    if (home.type === "session") expect(home.preventDefault).toBe(true);
  });

  it("End seeks to projectDurationMs", () => {
    const start = clipSession();
    expect(projectDurationMs(start.project)).toBe(5000);
    const next = sessionOf(dispatchEditorKey(start, false, { key: "End" }));
    expect(next.project.playheadMs).toBe(5000);
    expect(next.project.playheadMs).toBe(projectDurationMs(start.project));
  });

  it("empty project End seeks to 0", () => {
    const empty = createSession(createMemoryBlobStore());
    expect(projectDurationMs(empty.project)).toBe(0);
    const next = sessionOf(dispatchEditorKey(empty, false, { key: "End" }));
    expect(next.project.playheadMs).toBe(0);
  });

  it("focused TimecodeField Home/End do not seek", () => {
    const start = clipSession();
    expect(dispatchEditorKey(start, false, { key: "Home", formFocus: true }).type).toBe("none");
    expect(dispatchEditorKey(start, false, { key: "End", formFocus: true }).type).toBe("none");
    expect(start.project.playheadMs).toBe(2500);
  });
});
