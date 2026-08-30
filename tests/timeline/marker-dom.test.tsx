import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Timeline } from "../../src/ui/timeline/Timeline";
import { addMarker, deleteMarker, moveMarker } from "../../src/core/timeline";
import { createEmptyProject } from "../../src/core/project";
import type { Project, TrackId } from "../../src/core/models";
import "../../src/styles.css";

const noop = () => {};
const noopMs = (_ms: number) => {};

function MarkerHarness() {
  const [project, setProject] = useState<Project>(() => {
    let p = { ...createEmptyProject(), zoomPxPerSec: 100, scrollMs: 0 };
    p = addMarker(p, 1000, "M1");
    p = addMarker(p, 2500, "M2");
    return p;
  });
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(project.markers[0]!.id);
  return (
    <Timeline
      project={project}
      selectedClipId={null}
      selectedMarkerId={selectedMarkerId}
      onSelect={() => setSelectedMarkerId(null)}
      onSelectMarker={setSelectedMarkerId}
      onMarkerMoveLive={(id, ms) => {
        setProject((prev) => moveMarker(prev, id, ms).project);
      }}
      onMarkerMoveCommit={noop}
      onDeleteMarker={(id) => {
        setProject((prev) => deleteMarker(prev, id).project);
        setSelectedMarkerId((cur) => (cur === id ? null : cur));
      }}
      onPlayhead={noopMs}
      onMoveLive={(_id: string, _start: number, _track?: TrackId) => {}}
      onMoveCommit={noop}
      onTrimLive={(_id: string, _edge: "in" | "out", _ms: number) => {}}
      onTrimCommit={noop}
      onToggleMute={noop}
      onToggleVisualizerMute={noop}
      onCycleVisualizerScene={noop}
      onSplitHere={noop}
      onCut={noop}
      onCopy={noop}
      onPaste={noop}
      onDelete={noop}
      onZoom={noop}
      onFit={noopMs}
      onScroll={noopMs}
      onLoopClick={noopMs}
      onLoopInLive={noopMs}
      onLoopOutLive={noopMs}
      onLoopMoveLive={noopMs}
      onLoopCommit={noop}
    />
  );
}

describe("marker DOM", () => {
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

  it("drag moves the marker time; x and context menu delete only that marker", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<MarkerHarness />);
    });

    const flags = host.querySelectorAll("[data-testid^='marker-mk'], [data-testid^='marker-']");
    const markers = [...host.querySelectorAll(".marker")] as HTMLElement[];
    expect(markers.length).toBe(2);
    const first = markers[0]!;
    const firstId = first.getAttribute("data-testid")!.slice("marker-".length);
    const secondId = markers[1]!.getAttribute("data-testid")!.slice("marker-".length);

    act(() => {
      first.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 200 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300 }));
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup", {}));
    });

    const afterDrag = host.querySelector(`[data-testid="marker-${firstId}"]`) as HTMLElement;
    const left = Number.parseFloat(afterDrag.style.left);
    // zoom 100 px/s, pad 56, time should be ~2000ms → left ≈ 256
    expect(left).toBeGreaterThan(200);

    act(() => {
      (host!.querySelector(`[data-testid="marker-delete-${secondId}"]`) as HTMLButtonElement).click();
    });
    expect(host.querySelector(`[data-testid="marker-${secondId}"]`)).toBeNull();
    expect(host.querySelector(`[data-testid="marker-${firstId}"]`)).toBeTruthy();

    act(() => {
      host!
        .querySelector(`[data-testid="marker-${firstId}"]`)!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 20 }));
    });
    expect(host.querySelector('[data-testid="marker-menu"]')).toBeTruthy();
    act(() => {
      (host!.querySelector('[data-testid="marker-menu-delete"]') as HTMLButtonElement).click();
    });
    expect(host.querySelector(`[data-testid="marker-${firstId}"]`)).toBeNull();
    expect(flags.length).toBeGreaterThan(0);
  });
});
