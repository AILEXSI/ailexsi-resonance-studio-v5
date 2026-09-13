import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { addVolumeAutomationPoint } from "../../src/core/volume-automation";
import { createEmptyProject } from "../../src/core/project";
import { Mixer } from "../../src/ui/mixer/Mixer";
import { Timeline } from "../../src/ui/timeline/Timeline";
import type { TrackId } from "../../src/core/models";
import "../../src/styles.css";

const silentPeaks = { V1: 0, V2: 0, A1: 0, A2: 0, master: 0 };
const noop = () => {};
const noopMs = (_ms: number) => {};

function timelineNoops() {
  return {
    selectedClipId: null as string | null,
    onSelect: noop,
    onPlayhead: noopMs,
    onMoveLive: (_id: string, _start: number, _track?: TrackId) => {},
    onMoveCommit: noop,
    onTrimLive: (_id: string, _edge: "in" | "out", _ms: number) => {},
    onTrimCommit: noop,
    onToggleMute: noop,
    onToggleSolo: noop,
    onToggleVisualizerMute: noop,
    onCycleVisualizerScene: noop,
    onSplitHere: noop,
    onCut: noop,
    onCopy: noop,
    onPaste: noop,
    onDelete: noop,
    onZoom: noop,
    onFit: noopMs,
    onScroll: noopMs,
    onLoopClick: noopMs,
    onLoopInLive: noopMs,
    onLoopOutLive: noopMs,
    onLoopMoveLive: noopMs,
    onLoopCommit: noop,
  };
}

describe("volume automation lane chrome", () => {
  let host: HTMLDivElement | undefined;
  let root: Root | undefined;

  function mount(
    project: ReturnType<typeof createEmptyProject>,
    opts: {
      open?: string[];
      playing?: boolean;
      onToggle?: (id: TrackId) => void;
      onAdd?: (id: TrackId, timeMs: number, value: number) => void;
    } = {},
  ) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <div className="lower-stage" style={{ height: 280 }}>
          <div className="arrange-row" data-testid="arrange-row">
            <Timeline
              project={project}
              {...timelineNoops()}
              openVolumeLaneIds={opts.open}
              onToggleVolumeLane={opts.onToggle ?? (() => undefined)}
              onAddVolumeAutomationPoint={opts.onAdd}
            />
            <Mixer
              project={project}
              selectedTrackId="A1"
              peaks={silentPeaks}
              onSelectTrack={noop}
              onVolume={noop}
              onMasterVolume={noop}
              onToggleMute={noop}
              onToggleSolo={noop}
              playing={opts.playing}
            />
          </div>
        </div>,
      );
    });
  }

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
  });

  it("does not permanently double audio lane height; VOL toggle opens a sub-lane", () => {
    const toggled: string[] = [];
    mount(createEmptyProject(), { onToggle: (id) => toggled.push(id) });
    expect(host!.querySelector('[data-testid="volume-lane-A1"]')).toBeNull();
    const toggle = host!.querySelector('[data-testid="volume-lane-toggle-A1"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toBe("VOL");
    expect(toggle.getAttribute("aria-label")).toBe("Show volume automation");
    expect(host!.querySelector('[data-testid="volume-lane-toggle-V1"]')).toBeNull();
    act(() => {
      (host!.querySelector('[data-testid="volume-lane-toggle-A1"]') as HTMLButtonElement).click();
    });
    expect(toggled).toEqual(["A1"]);

    mount(createEmptyProject(), { open: ["A1"] });
    const audio = host!.querySelector('[data-testid="lane-A1"]') as HTMLElement;
    const vol = host!.querySelector('[data-testid="volume-lane-A1"]') as HTMLElement;
    expect(vol).toBeTruthy();
    expect(audio.style.height).not.toBe(vol.style.height);
    expect(host!.querySelector('[data-testid="volume-lane-A2"]')).toBeNull();
  });

  it("renders envelope points on the open lane", () => {
    const project = addVolumeAutomationPoint(createEmptyProject(), "A1", 0, 1).project;
    const withTwo = addVolumeAutomationPoint(project, "A1", 1000, 0.25).project;
    mount(withTwo, { open: ["A1"] });
    expect(host!.querySelector('[data-testid="volume-point-A1-0"]')).toBeTruthy();
    expect(host!.querySelector('[data-testid="volume-point-A1-1000"]')).toBeTruthy();
  });

  it("mixer keeps the static fader and shows an automation readout", () => {
    let project = addVolumeAutomationPoint(createEmptyProject(), "A1", 0, 0.5).project;
    project = {
      ...project,
      playheadMs: 0,
      tracks: project.tracks.map((t) => (t.id === "A1" ? { ...t, volume: 1 } : t)),
    };
    mount(project, { playing: true });
    const fader = host!.querySelector('[data-testid="mix-fader-A1"]') as HTMLInputElement;
    expect(fader).toBeTruthy();
    expect(host!.querySelector('[data-testid="mix-db-A1"]')?.textContent).toMatch(/0\.0 dB/);
    expect(host!.querySelector('[data-testid="mix-auto-db-A1"]')?.textContent).toMatch(/dB/);
    expect(host!.querySelector('[data-testid="mix-auto-ghost-A1"]')).toBeTruthy();
  });
});
