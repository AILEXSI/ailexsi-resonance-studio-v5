import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { addAudioTrack } from "../../src/core/audio-tracks";
import {
  MIXER_EXPANDED_PX,
  MIXER_MAX_PX,
  MIXER_MIN_PX,
  TIMELINE_MIN_PX,
  applyMixerWidthPointer,
  loadMixerWidth,
  saveMixerWidth,
  type StorageLike,
} from "../../src/core/layout-prefs";
import { createEmptyProject } from "../../src/core/project";
import { Mixer } from "../../src/ui/mixer/Mixer";
import "../../src/styles.css";

const silentPeaks = { V1: 0, V2: 0, A1: 0, A2: 0, master: 0 };

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    map,
  };
}

function ResizeHarness({ storage, arrangeWidth = 900 }: { storage: StorageLike; arrangeWidth?: number }) {
  const [widthPx, setWidthPx] = useState(() => loadMixerWidth(storage));
  const rowRef = useRef<HTMLDivElement>(null);
  const apply = (clientX: number) => {
    const next = applyMixerWidthPointer({ clientX, arrangeLeft: 0, arrangeWidth });
    setWidthPx(next.widthPx);
    saveMixerWidth(storage, next.widthPx);
  };
  return (
    <div
      className="arrange-row"
      data-testid="arrange-row"
      data-mixer-width={widthPx}
      ref={rowRef}
      style={{
        width: arrangeWidth,
        overflow: "hidden",
        ["--mixer-width" as string]: `${widthPx}px`,
      }}
    >
      <section className="timeline" data-testid="timeline" style={{ minWidth: 0 }}>
        arrange
      </section>
      <Mixer
        project={createEmptyProject()}
        selectedTrackId="A1"
        peaks={silentPeaks}
        onResizePointerDown={(e) => apply(e.clientX)}
        onSelectTrack={() => {}}
        onVolume={() => {}}
        onMasterVolume={() => {}}
        onToggleMute={() => {}}
        onToggleSolo={() => {}}
      />
    </div>
  );
}

describe("mixer resize", () => {
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

  function mount(storage: StorageLike, arrangeWidth = 900) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<ResizeHarness storage={storage} arrangeWidth={arrangeWidth} />);
    });
  }

  it("left-edge divider uses col-resize; drag left widens, drag right narrows; strips stay 42px", () => {
    const storage = memoryStorage();
    mount(storage);

    const row = host!.querySelector('[data-testid="arrange-row"]') as HTMLElement;
    const mixer = host!.querySelector('[data-testid="mixer"]') as HTMLElement;
    const timeline = host!.querySelector('[data-testid="timeline"]') as HTMLElement;
    const divider = host!.querySelector('[data-testid="mixer-resize"]') as HTMLElement;
    const scroll = host!.querySelector('[data-testid="mixer-channel-scroll"]') as HTMLElement;
    expect(timeline.nextElementSibling).toBe(mixer);
    expect(divider).toBeTruthy();
    expect(getComputedStyle(divider).cursor).toBe("col-resize");
    expect(Number(row.getAttribute("data-mixer-width"))).toBe(MIXER_EXPANDED_PX);
    expect(row.style.getPropertyValue("--mixer-width")).toBe(`${MIXER_EXPANDED_PX}px`);
    expect(parseFloat(getComputedStyle(mixer).width) || MIXER_EXPANDED_PX).toBe(MIXER_EXPANDED_PX);

    const stripW = (id: string) =>
      parseFloat(getComputedStyle(host!.querySelector(`[data-testid="mix-${id}"]`) as HTMLElement).width);
    expect(stripW("V1")).toBe(42);
    expect(stripW("A1")).toBe(42);
    expect(stripW("master")).toBe(42);

    const defaultX = 900 - MIXER_EXPANDED_PX;
    act(() => {
      divider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: defaultX - 100, button: 0 }));
    });
    const wide = Number(row.getAttribute("data-mixer-width"));
    expect(wide).toBe(MIXER_EXPANDED_PX + 100);
    expect(row.style.getPropertyValue("--mixer-width")).toBe(`${MIXER_EXPANDED_PX + 100}px`);
    expect(stripW("V1")).toBe(42);
    expect(stripW("master")).toBe(42);
    expect(loadMixerWidth(storage)).toBe(MIXER_EXPANDED_PX + 100);

    act(() => {
      divider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: defaultX + 80, button: 0 }));
    });
    const narrow = Number(row.getAttribute("data-mixer-width"));
    expect(narrow).toBe(MIXER_EXPANDED_PX - 80);
    expect(narrow).toBeGreaterThanOrEqual(MIXER_MIN_PX);
    expect(stripW("A2")).toBe(42);
    expect(getComputedStyle(scroll).overflowX === "auto" || scroll.style.overflowX === "auto").toBe(true);
    expect(host!.querySelector('[data-testid="mix-master"]')?.parentElement).toBe(
      host!.querySelector('[data-testid="mixer-channels"]'),
    );
    expect(scroll.contains(host!.querySelector('[data-testid="mix-master"]') as Node)).toBe(false);
    expect(host!.querySelector('[data-testid="mix-mute-A1"]')).toBeTruthy();
    expect(host!.querySelector('[data-testid="mix-solo-A1"]')).toBeTruthy();
    expect(host!.querySelector('[data-testid="mix-fader-A1"]')).toBeTruthy();
  });

  it("hides the divider while the mixer is collapsed", () => {
    const storage = memoryStorage();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <Mixer
          project={createEmptyProject()}
          selectedTrackId="A1"
          peaks={silentPeaks}
          collapsed
          onResizePointerDown={() => {}}
          onSelectTrack={() => {}}
          onVolume={() => {}}
          onMasterVolume={() => {}}
          onToggleMute={() => {}}
          onToggleSolo={() => {}}
        />,
      );
    });
    expect(host.querySelector('[data-testid="mixer-resize"]')).toBeNull();
    expect(host.querySelector('[data-testid="mix-master"]')).toBeTruthy();
  });

  it("clamps to min/max and restores persisted width", () => {
    const storage = memoryStorage();
    saveMixerWidth(storage, 400);
    mount(storage, 1000);
    const row = () => host!.querySelector('[data-testid="arrange-row"]') as HTMLElement;
    const mixer = () => host!.querySelector('[data-testid="mixer"]') as HTMLElement;
    expect(Number(row().getAttribute("data-mixer-width"))).toBe(400);

    const divider = host!.querySelector('[data-testid="mixer-resize"]') as HTMLElement;
    act(() => {
      divider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 0, button: 0 }));
    });
    expect(Number(row().getAttribute("data-mixer-width"))).toBe(Math.min(MIXER_MAX_PX, 1000 - TIMELINE_MIN_PX));

    act(() => {
      divider.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 1000, button: 0 }));
    });
    expect(Number(row().getAttribute("data-mixer-width"))).toBe(MIXER_MIN_PX);
    expect(getComputedStyle(mixer()).minWidth).not.toBe("0px");
  });

  it("extra audio strips stay in the horizontal scroller at a narrow mixer", () => {
    const storage = memoryStorage();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const added = addAudioTrack(addAudioTrack(createEmptyProject()).project);
    act(() => {
      root!.render(
        <div
          className="arrange-row"
          data-testid="arrange-row"
          style={{ width: 700, overflow: "hidden", ["--mixer-width" as string]: `${MIXER_MIN_PX}px` }}
        >
          <section className="timeline" data-testid="timeline">
            arrange
          </section>
          <Mixer
            project={added.project}
            selectedTrackId="A1"
            peaks={{ ...silentPeaks, A3: 0, A4: 0 }}
            onResizePointerDown={() => {}}
            onSelectTrack={() => {}}
            onVolume={() => {}}
            onMasterVolume={() => {}}
            onToggleMute={() => {}}
            onToggleSolo={() => {}}
          />
        </div>,
      );
    });
    const scroll = host.querySelector('[data-testid="mixer-channel-scroll"]') as HTMLElement;
    expect(host.querySelector('[data-testid="mix-A3"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="mix-A4"]')).toBeTruthy();
    expect(scroll.contains(host.querySelector('[data-testid="mix-A4"]') as Node)).toBe(true);
    expect(parseFloat(getComputedStyle(host.querySelector('[data-testid="mix-A4"]') as HTMLElement).width)).toBe(42);
    const overflow = getComputedStyle(scroll).overflowX || scroll.style.overflowX;
    expect(overflow === "auto" || overflow === "scroll").toBe(true);
  });
});
