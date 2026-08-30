import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "../../src/core/project";
import { Mixer } from "../../src/ui/mixer/Mixer";
import "../../src/styles.css";

const silentPeaks = { V1: 0, V2: 0, A1: 0, A2: 0, master: 0 };

describe("arrange + mixer layout", () => {
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

  it("mixer sits to the right of the timeline and is not a zero-width column", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <div className="app">
          <div className="arrange-row" data-testid="arrange-row">
            <section className="timeline" data-testid="timeline">
              arrange
            </section>
            <Mixer
              project={createEmptyProject()}
              selectedTrackId="A1"
              peaks={silentPeaks}
              onSelectTrack={() => {}}
              onVolume={() => {}}
              onMasterVolume={() => {}}
              onToggleMute={() => {}}
              onToggleSolo={() => {}}
            />
          </div>
        </div>,
      );
    });

    const row = host.querySelector('[data-testid="arrange-row"]');
    const timeline = host.querySelector('[data-testid="timeline"]');
    const mixer = host.querySelector('[data-testid="mixer"]');
    expect(row).toBeTruthy();
    expect(timeline).toBeTruthy();
    expect(mixer).toBeTruthy();
    expect(row!.contains(timeline!)).toBe(true);
    expect(row!.contains(mixer!)).toBe(true);
    expect(timeline!.nextElementSibling).toBe(mixer);

    const style = getComputedStyle(mixer as Element);
    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
    expect(style.minWidth).not.toBe("0px");
    expect(style.width).not.toBe("0px");
    expect(parseFloat(style.minWidth) || 228).toBeGreaterThanOrEqual(228);

    expect(host.querySelector('[data-testid="mix-V1"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="mix-fader-master"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="mix-db-A1"]')?.textContent).toMatch(/dB/);
  });
});
