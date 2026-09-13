import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { addAudioTrack } from "../../src/core/audio-tracks";
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

describe("dynamic audio lane chrome", () => {
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

  it("reuses the A-lane template for extra tracks and scrolls lanes + mixer independently", () => {
    const added = addAudioTrack(createEmptyProject());
    const a3 = added.track!;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const addedCalls: string[] = [];
    act(() => {
      root!.render(
        <div className="lower-stage" style={{ height: 240 }}>
          <div className="arrange-row" data-testid="arrange-row" style={{ overflow: "hidden" }}>
            <Timeline
              project={added.project}
              {...timelineNoops()}
              onAddAudioTrack={() => addedCalls.push("add")}
              onRemoveAudioTrack={() => addedCalls.push("remove")}
              canAddAudioTrack
              canRemoveAudioTrack
            />
            <Mixer
              project={added.project}
              selectedTrackId={a3.id}
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

    const lanes = host.querySelector('[data-testid="timeline-lanes"]') as HTMLElement;
    const a1 = host.querySelector('[data-testid="lane-A1"]') as HTMLElement;
    const extra = host.querySelector(`[data-testid="lane-${a3.id}"]`) as HTMLElement;
    expect(a1).toBeTruthy();
    expect(extra).toBeTruthy();
    expect(extra.className).toContain("audio-lane");
    expect(extra.querySelector(`[data-testid="mute-${a3.id}"]`)).toBeTruthy();
    expect(extra.querySelector(`[data-testid="solo-${a3.id}"]`)).toBeTruthy();
    expect(extra.querySelector(`[data-testid="lane-${a3.id}-body"]`)).toBeTruthy();
    expect(extra.textContent).toContain("A3");
    expect(a1.className.split(" ").filter((c) => c === "audio-lane")).toEqual(
      extra.className.split(" ").filter((c) => c === "audio-lane"),
    );
    const lanesOverflow = lanes.style.overflowY || getComputedStyle(lanes).overflowY;
    expect(lanesOverflow === "scroll" || lanesOverflow === "auto").toBe(true);

    const mixScroll = host.querySelector('[data-testid="mixer-channel-scroll"]') as HTMLElement;
    expect(mixScroll).toBeTruthy();
    expect(host.querySelector('[data-testid="mix-A1"]')).toBeTruthy();
    expect(host.querySelector(`[data-testid="mix-${a3.id}"]`)).toBeTruthy();
    expect(host.querySelector('[data-testid="mix-master"]')).toBeTruthy();
    const mixOverflow = getComputedStyle(mixScroll).overflowX || mixScroll.style.overflowX;
    expect(mixOverflow === "auto" || mixOverflow === "scroll").toBe(true);

    act(() => {
      (host!.querySelector('[data-testid="add-audio-track"]') as HTMLButtonElement).click();
      (host!.querySelector('[data-testid="remove-audio-track"]') as HTMLButtonElement).click();
    });
    expect(addedCalls).toEqual(["add", "remove"]);
  });
});
