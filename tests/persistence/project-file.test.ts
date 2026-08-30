import { describe, expect, it } from "vitest";
import { downloadText } from "../../src/core/project";
import {
  emptyProjectFileMemory,
  hasFileSystemAccess,
  loadStatusFallback,
  loadStatusFsa,
  openPickerOptions,
  rememberFileHandle,
  runOpen,
  runSave,
  savePickerOptions,
  saveStatusFallback,
  saveStatusFsa,
  startInForPicker,
  statusHasFakePath,
  type DirectoryHandleLike,
  type FileHandleLike,
  type PickerHost,
  type SavePickerOptions,
} from "../../src/core/project-file";
import { createMemoryProjectFileStore } from "../../src/core/project-file-store";

function mockFileHandle(name: string, extras: Partial<FileHandleLike> = {}): FileHandleLike {
  const written: string[] = [];
  return {
    name,
    kind: "file",
    createWritable: async () => ({
      write: async (data) => {
        written.push(typeof data === "string" ? data : await data.text());
      },
      close: async () => {},
    }),
    getFile: async () => {
      const body = `{"name":"${name}"}`;
      const file = new File([body], name, { type: "application/json" });
      if (typeof file.text !== "function") {
        return Object.assign(file, { text: async () => body });
      }
      return file;
    },
    queryPermission: async () => "granted",
    ...extras,
    // expose writes for asserts when not overwritten
    ...(extras.createWritable ? {} : {}),
  };
}

describe("project file picker memory", () => {
  it("first run startIn is documents, then the remembered directory", async () => {
    const empty = emptyProjectFileMemory();
    expect(startInForPicker(empty)).toBe("documents");
    expect(savePickerOptions("Song.resonance.json", empty).startIn).toBe("documents");
    expect(openPickerOptions(empty).startIn).toBe("documents");

    const dir: DirectoryHandleLike = { kind: "directory", name: "Projects" };
    const file = mockFileHandle("Song.resonance.json", {
      getParent: async () => dir,
    });
    const store = createMemoryProjectFileStore();
    const memory = await rememberFileHandle(store, file);
    expect(memory.lastFileName).toBe("Song.resonance.json");
    expect(startInForPicker(memory)).toBe(dir);
    expect(savePickerOptions("Song.resonance.json", memory).startIn).toBe(dir);
    expect(openPickerOptions(memory).startIn).toBe(dir);
  });

  it("save/open helpers pass startIn on the next picker", async () => {
    const dir: DirectoryHandleLike = { kind: "directory", name: "Studio" };
    const store = createMemoryProjectFileStore();
    let saveOpts: SavePickerOptions | undefined;
    const file = mockFileHandle("Mix.resonance.json", { getParent: async () => dir });
    const host: PickerHost = {
      showSaveFilePicker: async (opts) => {
        saveOpts = opts;
        return file;
      },
      showOpenFilePicker: async (opts) => {
        expect(opts.startIn).toBe(dir);
        return [file];
      },
    };
    const first = await runSave({
      host,
      store,
      memory: emptyProjectFileMemory(),
      filename: "Mix.resonance.json",
      json: '{"ok":true}',
      fallbackDownload: () => {
        throw new Error("should use FSA");
      },
    });
    expect(saveOpts?.startIn).toBe("documents");
    expect(first.status).toBe(saveStatusFsa("Mix.resonance.json"));
    expect(first.status).toContain("Mix.resonance.json");
    expect(first.usedFallback).toBe(false);
    expect(startInForPicker(first.memory)).toBe(dir);

    const opened = await runOpen({ host, store, memory: first.memory });
    expect(opened.kind).toBe("opened");
    if (opened.kind === "opened") {
      expect(opened.status).toBe(loadStatusFsa("Mix.resonance.json"));
      expect(opened.status).toContain("Mix.resonance.json");
      expect(opened.fileName).toBe("Mix.resonance.json");
    }
  });

  it("UI status includes the file name after save and after load", () => {
    expect(saveStatusFsa("Beginagain.resonance.json")).toContain("Beginagain.resonance.json");
    expect(loadStatusFsa("Beginagain.resonance.json")).toContain("Beginagain.resonance.json");
    expect(saveStatusFsa("Beginagain.resonance.json")).toMatch(/gemerkt/);
  });

  it("fallback path does not claim a fake filesystem path", async () => {
    const downloads: string[] = [];
    const result = await runSave({
      host: {},
      store: createMemoryProjectFileStore(),
      memory: emptyProjectFileMemory(),
      filename: "Untitled_Resonance.resonance.json",
      json: "{}",
      fallbackDownload: (name, text) => {
        downloads.push(`${name}:${text}`);
      },
    });
    expect(hasFileSystemAccess({})).toBe(false);
    expect(result.usedFallback).toBe(true);
    expect(result.status).toBe(saveStatusFallback("Untitled_Resonance.resonance.json"));
    expect(result.status).toContain("Untitled_Resonance.resonance.json");
    expect(result.status).toMatch(/Downloads/);
    expect(result.status).toMatch(/unbekannt/);
    expect(statusHasFakePath(result.status)).toBe(false);
    expect(statusHasFakePath(loadStatusFallback("clip.resonance.json"))).toBe(false);
    expect(loadStatusFallback("clip.resonance.json")).toContain("clip.resonance.json");
    expect(downloads[0]).toContain("Untitled_Resonance.resonance.json");
    expect(typeof downloadText).toBe("function");
  });
});
