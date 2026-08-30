import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../src/core/project";
import { Mixer } from "../../src/ui/mixer/Mixer";
import { Timeline } from "../../src/ui/timeline/Timeline";
import type { TrackId } from "../../src/core/models";
import "../../src/styles.css";

const silentPeaks = { V1: 0, V2: 0, A1: 0, A2: 0, master: 0 };
const noop = () => {};
const noopMs = (_ms: number) => {};

describe("arrange overflow", () => {
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

  it("arrange-row overflow-y is scrollable so A2 stays reachable when preview is tall", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <div className="lower-stage" style={{ height: 140 }}>
          <div className="arrange-row" data-testid="arrange-row" style={{ overflowY: "auto" }}>
            <Timeline
              project={createEmptyProject()}
              selectedClipId={null}
              onSelect={noop}
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
            <Mixer
              project={createEmptyProject()}
              selectedTrackId="A1"
              peaks={silentPeaks}
              onSelectTrack={noop}
              onVolume={noop}
              onMasterVolume={noop}
              onToggleMute={noop}
              onToggleSolo={noop}
            />
          </div>
        </div>,
      );
    });
    const row = host.querySelector('[data-testid="arrange-row"]') as HTMLElement;
    expect(row).toBeTruthy();
    const overflowY = row.style.overflowY || getComputedStyle(row).overflowY;
    expect(overflowY === "auto" || overflowY === "scroll").toBe(true);
    expect(host.querySelector('[data-testid="mute-A2"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="mute-V2"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="lane-VIS"]')).toBeTruthy();
  });
});
