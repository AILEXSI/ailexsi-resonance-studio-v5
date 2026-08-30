import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Timeline } from "../../src/ui/timeline/Timeline";
import { asset, clip, projectWith } from "../helpers";
import type { TrackId } from "../../src/core/models";
import "../../src/styles.css";

const noop = () => {};
const noopMs = (_ms: number) => {};

function pointer(type: string, init: MouseEventInit = {}): Event {
  const Ctor = typeof PointerEvent === "undefined" ? MouseEvent : PointerEvent;
  return new Ctor(type, { bubbles: true, cancelable: true, ...init });
}

describe("lane header chrome", () => {
  let host: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    host = undefined;
    root = undefined;
  });

  function mount(
    extras: {
      laneLabelPx?: number;
      onLaneLabelPx?: (px: number) => void;
      onLaneHeight?: (group: "vis" | "video" | "audio", px: number) => void;
      mutedV1?: boolean;
    } = {},
  ) {
    const project = projectWith(
      [clip({ id: "v1", assetId: "va", trackId: "V1", startMs: 0, durationMs: 2000 })],
      [asset({ id: "va", kind: "video", durationMs: 4000 })],
    );
    if (extras.mutedV1) {
      project.tracks = project.tracks.map((t) => (t.id === "V1" ? { ...t, muted: true } : t));
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <Timeline
          project={project}
          selectedClipId="v1"
          onSelect={() => {}}
          onPlayhead={noopMs}
          onMoveLive={() => {}}
          onMoveCommit={noop}
          onTrimLive={() => {}}
          onTrimCommit={noop}
          onToggleMute={(_id: TrackId) => {}}
          onToggleVisualizerMute={noop}
          onCycleVisualizerScene={noop}
          onSplitHere={() => {}}
          onCut={noop}
          onCopy={noop}
          onPaste={noop}
          onDelete={noop}
          onZoom={() => {}}
          onFit={noopMs}
          onScroll={noopMs}
          onLoopClick={noopMs}
          onLoopInLive={noopMs}
          onLoopOutLive={noopMs}
          onLoopMoveLive={noopMs}
          onLoopCommit={noop}
          laneLabelPx={extras.laneLabelPx ?? 96}
          onLaneLabelPx={extras.onLaneLabelPx}
          onLaneHeight={extras.onLaneHeight}
        />,
      );
    });
  }

  it("exposes a shared label splitter and lane height handles", () => {
    mount();
    expect(host!.querySelector("[data-testid=lane-label-splitter]")).toBeTruthy();
    expect(host!.querySelector("[data-testid=lane-height-VIS]")).toBeTruthy();
    expect(host!.querySelector("[data-testid=lane-height-V1]")).toBeTruthy();
    const label = host!.querySelector(".lane-label") as HTMLElement;
    expect(getComputedStyle(label).fontSize).toBe("14px");
  });

  it("dragging the label splitter writes a clamped width", () => {
    const widths: number[] = [];
    mount({
      laneLabelPx: 96,
      onLaneLabelPx: (px) => widths.push(px),
    });
    const handle = host!.querySelector("[data-testid=lane-label-splitter]")!;
    act(() => {
      handle.dispatchEvent(pointer("pointerdown", { button: 0, clientX: 96 }));
    });
    act(() => {
      window.dispatchEvent(pointer("pointermove", { clientX: 140 }));
    });
    act(() => {
      window.dispatchEvent(pointer("pointerup", { clientX: 140 }));
    });
    expect(widths.at(-1)).toBe(140);
  });

  it("does not dim a muted V1 filmstrip", () => {
    mount({ mutedV1: true });
    const lane = host!.querySelector("[data-testid=lane-V1]")!;
    expect(lane.className).toContain("muted");
    expect(lane.className).toContain("video-lane");
    const body = host!.querySelector("[data-testid=lane-V1-body]") as HTMLElement;
    expect(getComputedStyle(body).opacity).toBe("1");
  });
});
