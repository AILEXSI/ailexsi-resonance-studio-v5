import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, afterEach } from "vitest";
import { Cutter } from "../../src/ui/cutter/Cutter";
import type { EditorCommand } from "../../src/app/commands";
import { asset, clip, projectWith } from "../helpers";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(node);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("Cutter", () => {
  it("shows no edit when selection has no stacked pair", () => {
    const project = projectWith(
      [clip({ id: "v1", assetId: "va", trackId: "V1", startMs: 0, durationMs: 500 })],
      [asset({ id: "va", kind: "video", name: "Solo", durationMs: 500 })],
    );
    render(
      <Cutter project={project} selectedClipId="v1" selectedClipIds={["v1"]} apply={() => {}} />,
    );
    expect(host!.querySelector("[data-testid=cutter-empty]")?.textContent).toMatch(/No edit/);
  });

  it("labels Source A / Source B from the stacked pair", () => {
    const project = projectWith(
      [
        clip({ id: "v1", assetId: "va", trackId: "V1", startMs: 0, durationMs: 2000 }),
        clip({ id: "v2", assetId: "vb", trackId: "V2", startMs: 1000, durationMs: 2000 }),
      ],
      [
        asset({ id: "va", kind: "video", name: "Outgoing", durationMs: 4000 }),
        asset({ id: "vb", kind: "video", name: "Incoming", durationMs: 4000 }),
      ],
    );
    const cmds: EditorCommand[] = [];
    render(
      <Cutter
        project={project}
        selectedClipId="v2"
        selectedClipIds={["v2"]}
        apply={(c) => cmds.push(c)}
      />,
    );
    expect(host!.querySelector("[data-testid=cutter-source-a]")?.textContent).toMatch(/Source A/);
    expect(host!.querySelector("[data-testid=cutter-source-a]")?.textContent).toMatch(/Outgoing/);
    expect(host!.querySelector("[data-testid=cutter-source-a]")?.textContent).toMatch(/V1/);
    expect(host!.querySelector("[data-testid=cutter-source-b]")?.textContent).toMatch(/Incoming/);
    expect(host!.querySelector("[data-testid=cutter-source-b]")?.textContent).toMatch(/V2/);
    const type = host!.querySelector<HTMLSelectElement>("[data-testid=cutter-type]");
    act(() => {
      type!.value = "crossfade";
      type!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(cmds[0]).toEqual({ type: "setTransition", transitionType: "crossfade" });
    act(() => {
      host!.querySelector<HTMLButtonElement>("[data-testid=cutter-source-V2]")!.click();
    });
    expect(cmds[1]).toEqual({ type: "setTransitionSource", source: "V2" });
    expect(host!.querySelector("[data-testid=cutter-source-auto]")?.classList.contains("on")).toBe(true);
    act(() => {
      host!.querySelector<HTMLButtonElement>("[data-testid=cutter-audio-keepA]")!.click();
    });
    expect(cmds[2]).toEqual({ type: "setTransitionAudio", audio: "keepA" });
    expect(host!.querySelector("[data-testid=cutter-audio-cut]")?.classList.contains("on")).toBe(true);
  });
});
