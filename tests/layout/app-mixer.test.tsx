import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../src/app/App";
import "../../src/styles.css";

describe("App arrange layout", () => {
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

  it("App mounts mixer beside the timeline and the Projekt panel", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<App />);
    });
    const row = host.querySelector('[data-testid="arrange-row"]');
    const timeline = host.querySelector('[data-testid="timeline"]');
    const mixer = host.querySelector('[data-testid="mixer"]');
    expect(row && timeline && mixer).toBeTruthy();
    expect(row!.contains(timeline!)).toBe(true);
    expect(row!.contains(mixer!)).toBe(true);
    expect(timeline!.nextElementSibling).toBe(mixer);
    expect(getComputedStyle(mixer!).display).not.toBe("none");
    expect(getComputedStyle(mixer!).minWidth).not.toBe("0px");
    expect(host.querySelector('[data-testid="project-file-panel"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="project-file-name"]')).toBeTruthy();
  });
});
