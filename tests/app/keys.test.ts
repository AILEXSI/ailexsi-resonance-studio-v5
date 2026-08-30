import { describe, expect, it } from "vitest";
import { dispatchEditorKey } from "../../src/app/keys";
import { applyCopy, createSession, type Session } from "../../src/app/session";
import { FRAME_MS } from "../../src/core/models";
import { createMemoryBlobStore } from "../../src/core/persistence";
import { asset, clip, projectWith } from "../helpers";

function clipSession(): Session {
  const a = asset({ id: "a", kind: "audio", durationMs: 2000 });
  const c = clip({ id: "c1", assetId: "a", trackId: "A1", startMs: 0, durationMs: 2000 });
  return {
    ...createSession(createMemoryBlobStore()),
    project: { ...projectWith([c], [a]), playheadMs: 1000, inPointMs: 200, outPointMs: 1800 },
    selectedClipId: "c1",
  };
}

function sessionOf(action: ReturnType<typeof dispatchEditorKey>): Session {
  expect(action.type).toBe("session");
  if (action.type !== "session") throw new Error("expected session action");
  return action.session;
}

describe("editor keys", () => {
  it("S splits at the playhead", () => {
    const next = sessionOf(dispatchEditorKey(clipSession(), false, { key: "s" }));
    expect(next.project.clips).toHaveLength(2);
    expect(next.status).toBe("Split at playhead");
  });

  it("bare V does not split", () => {
    const start = clipSession();
    const action = dispatchEditorKey(start, false, { key: "v" });
    expect(action.type).toBe("none");
    expect(start.project.clips).toHaveLength(1);
  });

  it("Ctrl+V pastes and does not split", () => {
    let s = applyCopy(clipSession());
    s = { ...s, project: { ...s.project, playheadMs: 2000 } };
    const next = sessionOf(dispatchEditorKey(s, false, { key: "v", ctrlKey: true }));
    expect(next.project.clips).toHaveLength(2);
    expect(next.status).toBe("Pasted clip");
    const original = next.project.clips.find((c) => c.id === "c1");
    expect(original?.durationMs).toBe(2000);
    expect(original?.startMs).toBe(0);
  });

  it("Ctrl+C copies and leaves the clip", () => {
    const start = clipSession();
    const next = sessionOf(dispatchEditorKey(start, false, { key: "c", ctrlKey: true }));
    expect(next.project.clips).toHaveLength(1);
    expect(next.clipboard?.id).toBe("c1");
    expect(next.project.clips[0]!.id).toBe("c1");
    expect(next.status).toBe("Copied clip");
  });

  it("Ctrl+X cuts: clipboard filled and clip removed", () => {
    const next = sessionOf(dispatchEditorKey(clipSession(), false, { key: "x", ctrlKey: true }));
    expect(next.project.clips).toHaveLength(0);
    expect(next.clipboard?.id).toBe("c1");
    expect(next.selectedClipId).toBeNull();
    expect(next.status).toBe("Cut clip");
  });

  it("bare X still clears IN/OUT", () => {
    const next = sessionOf(dispatchEditorKey(clipSession(), false, { key: "x" }));
    expect(next.project.clips).toHaveLength(1);
    expect(next.project.inPointMs).toBeNull();
    expect(next.project.outPointMs).toBeNull();
    expect(next.status).toBe("IN/OUT cleared");
  });

  it("Shift+Delete ripple-deletes; Delete still lifts", () => {
    const a = asset({ id: "a", kind: "audio", durationMs: 2000 });
    const s: Session = {
      ...createSession(createMemoryBlobStore()),
      project: projectWith(
        [
          clip({ id: "c1", assetId: "a", trackId: "A1", startMs: 0, durationMs: 1000 }),
          clip({ id: "c2", assetId: "a", trackId: "A1", startMs: 1000, durationMs: 500 }),
        ],
        [a],
      ),
      selectedClipId: "c1",
    };
    const lifted = sessionOf(dispatchEditorKey(s, false, { key: "Delete" }));
    expect(lifted.project.clips.find((c) => c.id === "c2")!.startMs).toBe(1000);
    expect(lifted.project.clips.find((c) => c.id === "c1")).toBeUndefined();

    const rippled = sessionOf(dispatchEditorKey(s, false, { key: "Delete", shiftKey: true }));
    expect(rippled.project.clips.find((c) => c.id === "c2")!.startMs).toBe(0);
    expect(rippled.status).toBe("Ripple deleted");

    const backspace = sessionOf(dispatchEditorKey(s, false, { key: "Backspace", shiftKey: true }));
    expect(backspace.project.clips.find((c) => c.id === "c2")!.startMs).toBe(0);
  });

  it("J K L shuttle; Space is 1x play/pause", () => {
    let s = clipSession();
    s = sessionOf(dispatchEditorKey(s, false, { key: "l" }));
    expect(s.shuttleRate).toBe(1);
    s = sessionOf(dispatchEditorKey(s, true, { key: "l" }));
    expect(s.shuttleRate).toBe(2);
    s = sessionOf(dispatchEditorKey(s, true, { key: "l" }));
    expect(s.shuttleRate).toBe(4);
    s = sessionOf(dispatchEditorKey(s, true, { key: "k" }));
    expect(s.shuttleRate).toBe(0);
    expect(s.playing).toBe(false);
    s = sessionOf(dispatchEditorKey(s, false, { key: "j" }));
    expect(s.shuttleRate).toBe(-1);
    s = sessionOf(dispatchEditorKey(s, true, { key: "j" }));
    expect(s.shuttleRate).toBe(-2);
    s = sessionOf(dispatchEditorKey(s, true, { key: " " }));
    expect(s.shuttleRate).toBe(0);
    expect(s.playing).toBe(false);
    s = sessionOf(dispatchEditorKey(s, false, { key: " " }));
    expect(s.shuttleRate).toBe(1);
    expect(s.playing).toBe(true);
  });

  it("comma / period nudge 1 frame; Shift is 10 frames; arrows still move the playhead", () => {
    const start = clipSession();
    const right = sessionOf(dispatchEditorKey(start, false, { key: "." }));
    expect(right.project.clips[0]!.startMs).toBeCloseTo(FRAME_MS, 5);
    const left = sessionOf(dispatchEditorKey(right, false, { key: "," }));
    expect(left.project.clips[0]!.startMs).toBe(0);
    const ten = sessionOf(dispatchEditorKey(start, false, { key: ".", shiftKey: true }));
    expect(ten.project.clips[0]!.startMs).toBeCloseTo(10 * FRAME_MS, 5);
    const playhead = sessionOf(dispatchEditorKey(start, false, { key: "ArrowRight" }));
    expect(playhead.project.playheadMs).toBe(start.project.playheadMs + FRAME_MS);
    expect(playhead.project.clips[0]!.startMs).toBe(0);
  });

  it("Ctrl/Meta ignore bare letter shortcuts S M X I O", () => {
    const start = clipSession();
    for (const key of ["s", "m", "x", "i", "o"] as const) {
      const action = dispatchEditorKey(start, false, { key, ctrlKey: true });
      if (key === "x") {
        expect(action.type).toBe("session");
        if (action.type === "session") expect(action.session.status).toBe("Cut clip");
      } else {
        expect(action.type).toBe("none");
      }
    }
    const metaS = dispatchEditorKey(start, false, { key: "s", metaKey: true });
    expect(metaS.type).toBe("none");
  });
});
