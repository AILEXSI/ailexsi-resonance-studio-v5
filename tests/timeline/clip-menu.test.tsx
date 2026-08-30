import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, afterEach } from "vitest";
import { Timeline } from "../../src/ui/timeline/Timeline";
import { ShortcutsOverlay } from "../../src/ui/shortcuts/ShortcutsOverlay";
import { Toolbar } from "../../src/ui/toolbar/Toolbar";
import { Transport } from "../../src/ui/transport/Transport";
import { CLIP_MENU_SHORTCUTS } from "../../src/ui/shortcuts/labels";
import { createEmptyProject } from "../../src/core/project";
import { asset, clip, projectWith } from "../helpers";
import type { TrackId } from "../../src/core/models";

const noop = () => {};
const noopMs = (_ms: number) => {};

function timelineProps() {
  const project = projectWith(
    [clip({ id: "c1", assetId: "a", trackId: "V1", startMs: 0, durationMs: 2000 })],
    [asset({ id: "a", kind: "video", durationMs: 2000 })],
  );
  return {
    project,
    selectedClipId: "c1",
    onSelect: (_id: string | null) => {},
    onPlayhead: noopMs,
    onMoveLive: (_id: string, _start: number, _track?: TrackId) => {},
    onMoveCommit: noop,
    onTrimLive: (_id: string, _edge: "in" | "out", _ms: number) => {},
    onTrimCommit: noop,
    onToggleMute: (_id: TrackId) => {},
    onToggleSolo: (_id: TrackId) => {},
    onToggleVisualizerMute: noop,
    onCycleVisualizerScene: noop,
    onSplitHere: (_id: string, _ms: number) => {},
    onCut: noop,
    onCopy: noop,
    onPaste: noop,
    onDelete: noop,
    onZoom: (_z: number, _w: number) => {},
    onFit: noopMs,
    onScroll: noopMs,
    onLoopClick: noopMs,
    onLoopInLive: noopMs,
    onLoopOutLive: noopMs,
    onLoopMoveLive: noopMs,
    onLoopCommit: noop,
    onRelink: noop,
    onCloseGap: noop,
  };
}

describe("clip-menu shortcut labels", () => {
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

  it("shows S, Ctrl+X, Ctrl+C, Ctrl+V, Delete in the clip menu", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<Timeline {...timelineProps()} />);
    });
    const clipEl = host.querySelector(".clip");
    expect(clipEl).toBeTruthy();
    act(() => {
      clipEl!.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
      );
    });
    const menu = host.querySelector('[data-testid="clip-menu"]');
    expect(menu).toBeTruthy();
    const text = menu!.textContent ?? "";
    expect(text).toContain("Split here");
    expect(text).toContain(CLIP_MENU_SHORTCUTS.split);
    expect(text).toContain("Cut");
    expect(text).toContain("Ctrl+X");
    expect(text).toContain("Copy");
    expect(text).toContain("Ctrl+C");
    expect(text).toContain("Paste");
    expect(text).toContain("Ctrl+V");
    expect(text).toContain("Delete");
    expect(text).toContain("Ripple delete");
    expect(text).toContain("Shift+Delete");
    expect(text).toContain("Lift range");
    expect(text).toContain("Extract range");
    expect(text).toContain("Relink");
    expect(menu!.querySelector('[data-testid="clip-menu-relink"]')).toBeTruthy();
    expect(text).toContain("Close gap");
    expect(text).toContain("G");
    expect(menu!.querySelector('[data-testid="clip-menu-close-gap"]')).toBeTruthy();
    expect(text).toContain(CLIP_MENU_SHORTCUTS.liftRange);
    expect(text).toContain(CLIP_MENU_SHORTCUTS.extractRange);
    expect(CLIP_MENU_SHORTCUTS.split).toBe("S");
    expect(CLIP_MENU_SHORTCUTS.rippleDelete).toBe("Shift+Delete");
    const splitRow = [...menu!.querySelectorAll("button")].find((b) =>
      (b.textContent ?? "").includes("Split here"),
    );
    expect(splitRow?.querySelector("kbd")?.textContent).toBe("S");
  });

  it("ShortcutsOverlay uses the same labels and does not call V split", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<ShortcutsOverlay open />);
    });
    const sheet = host.querySelector('[data-testid="shortcuts"]');
    expect(sheet).toBeTruthy();
    const text = sheet!.textContent ?? "";
    expect(text).toContain("Split is S");
    expect(text).toContain("Split at playhead");
    expect(text).toContain("S");
    expect(text).toContain("Ctrl+X");
    expect(text).toContain("Ctrl+C");
    expect(text).toContain("Ctrl+V");
    expect(text).toContain("Delete");
    expect(text).toContain("Shift+Delete");
    expect(text).toContain("J / K / L");
    expect(text).toContain(", / .");
    expect(text).toContain("Lane / Mixer S");
    expect(text).toContain("Shift+edge-drag");
    expect(text).toContain("Abutting edge-drag");
    expect(text).toContain("Alt+drag clip");
    expect(text).toContain("Alt+, / Alt+.");
    expect(text).toContain("Ctrl+Alt+drag clip");
    expect(text).toContain("Shift+Alt+, / Shift+Alt+.");
    expect(text).toContain("Copy selected clip(s)");
    expect(text).toContain("Ctrl+Shift+L");
    expect(text).toContain("Unlink A/V pair");
    expect(text).toContain("Lift range (IN/OUT)");
    expect(text).toContain("Extract range (IN/OUT)");
    expect(text).toContain("Close gap under playhead");
    expect(text).toContain("G");
    expect(text).not.toContain("Cut is V");
    expect(text).not.toContain("Split is V");
  });

  it("toolbar and transport Split document S", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const noopBtn = () => {};
    act(() => {
      root!.render(
        <>
          <Toolbar
            snap
            exporting={false}
            onNew={noopBtn}
            onSave={noopBtn}
            onOpen={noopBtn}
            onOpenFile={(_file: File) => {}}
            onImport={noopBtn}
            onExport={noopBtn}
            onUndo={noopBtn}
            onRedo={noopBtn}
            onSplit={noopBtn}
            onToggleSnap={noopBtn}
          />
          <Transport
            project={createEmptyProject()}
            playing={false}
            onPlay={noopBtn}
            onPause={noopBtn}
            onStop={noopBtn}
            onStep={noopMs}
            onToggleLoop={noopBtn}
            onIn={noopBtn}
            onOut={noopBtn}
            onClear={noopBtn}
            onMarker={noopBtn}
            onSplit={noopBtn}
          />
        </>,
      );
    });
    const splits = [...host.querySelectorAll("button")].filter((b) =>
      (b.textContent ?? "").includes("Split"),
    );
    expect(splits.length).toBeGreaterThanOrEqual(2);
    for (const btn of splits) {
      expect(btn.getAttribute("title")).toBe("Split (S)");
      expect(btn.querySelector("kbd")?.textContent).toBe("S");
    }
  });
});

describe("timeline multi-select chrome", () => {
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

  it("marks every selected clip and keeps trim handles on the primary only", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const project = projectWith(
      [
        clip({ id: "c1", assetId: "a", trackId: "V1", startMs: 0, durationMs: 800 }),
        clip({ id: "c2", assetId: "a", trackId: "V1", startMs: 1000, durationMs: 800 }),
      ],
      [asset({ id: "a", kind: "video", durationMs: 2000 })],
    );
    act(() => {
      root!.render(
        <Timeline
          {...timelineProps()}
          project={project}
          selectedClipId="c1"
          selectedClipIds={["c1", "c2"]}
        />,
      );
    });
    const a = host.querySelector('[data-testid="clip-c1"]');
    const b = host.querySelector('[data-testid="clip-c2"]');
    expect(a?.classList.contains("selected")).toBe(true);
    expect(b?.classList.contains("selected")).toBe(true);
    expect(a?.getAttribute("data-selected")).toBe("true");
    expect(b?.getAttribute("data-selected")).toBe("true");
    expect(host.querySelector('[data-testid="trim-in-c1"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="trim-out-c1"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="trim-in-c2"]')).toBeNull();
    expect(host.querySelector('[data-testid="trim-out-c2"]')).toBeNull();
  });
});
