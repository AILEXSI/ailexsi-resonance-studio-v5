import { describe, expect, it } from "vitest";
import { downloadText } from "../../src/core/project";
import {
  emptyProjectFileMemory,
  hasFileSystemAccess,
  loadStatusFallback,
  loadStatusFsa,
  openPickerOptions,
  pickRelinkMediaFile,
  relinkAcceptAttr,
  projectPanelView,
  rememberDirectoryHandle,
  rememberFileHandle,
  runChooseFolder,
  runOpen,
  runOpenRecent,
  runSave,
  runSaveAs,
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

  it("recents store round-trips file and directory handles", async () => {
    const dir: DirectoryHandleLike = { kind: "directory", name: "Mixes" };
    const fileA = mockFileHandle("A.resonance.json", { getParent: async () => dir });
    const fileB = mockFileHandle("B.resonance.json", { getParent: async () => dir });
    const store = createMemoryProjectFileStore();
    const first = await rememberFileHandle(store, fileA);
    expect(first.recents).toHaveLength(1);
    expect(first.recents[0].fileHandle).toBe(fileA);
    expect(first.recents[0].directoryHandle).toBe(dir);
    expect(first.recents[0].lastFileName).toBe("A.resonance.json");

    const loaded = await store.load();
    expect(loaded.recents[0].fileHandle).toBe(fileA);
    expect(loaded.recents[0].directoryHandle).toBe(dir);
    expect(loaded.lastFileName).toBe("A.resonance.json");

    const second = await rememberFileHandle(store, fileB, loaded);
    expect(second.recents.map((row) => row.lastFileName)).toEqual([
      "B.resonance.json",
      "A.resonance.json",
    ]);
    expect(second.recents[0].fileHandle).toBe(fileB);
    expect(second.recents[1].fileHandle).toBe(fileA);
    expect((await store.load()).recents[1].directoryHandle).toBe(dir);
  });

  it("panel view shows last file and folder name, never a fake Windows path", () => {
    const named = projectPanelView({
      fileHandle: mockFileHandle("Song.resonance.json"),
      directoryHandle: { kind: "directory", name: "Projects" },
      lastFileName: "Song.resonance.json",
      recents: [],
    });
    expect(named.fileName).toBe("Song.resonance.json");
    expect(named.folderLabel).toBe("Projects");
    expect(named.folderRemembered).toBe(true);
    expect(statusHasFakePath(named.fileName)).toBe(false);
    expect(statusHasFakePath(named.folderLabel)).toBe(false);
    expect(named.folderLabel).not.toMatch(/C:\\Users/);
    expect(named.folderLabel).not.toMatch(/\/Users\//);

    const unnamedDir = projectPanelView({
      fileHandle: mockFileHandle("Song.resonance.json"),
      directoryHandle: { kind: "directory" },
      lastFileName: "Song.resonance.json",
      recents: [],
    });
    expect(unnamedDir.folderLabel).toBe("Song.resonance.json — Ordner gemerkt");
    expect(statusHasFakePath(unnamedDir.folderLabel)).toBe(false);
    expect(unnamedDir.folderLabel).not.toMatch(/C:\\/);
  });

  it("Speichern unter and Öffnen pass startIn the last directory", async () => {
    const dir: DirectoryHandleLike = { kind: "directory", name: "Studio" };
    const store = createMemoryProjectFileStore();
    const existing = mockFileHandle("Old.resonance.json", { getParent: async () => dir });
    const next = mockFileHandle("New.resonance.json", { getParent: async () => dir });
    let saveOpts: SavePickerOptions | undefined;
    let saveCalls = 0;
    const host: PickerHost = {
      showSaveFilePicker: async (opts) => {
        saveCalls += 1;
        saveOpts = opts;
        return next;
      },
      showOpenFilePicker: async (opts) => {
        expect(opts.startIn).toBe(dir);
        return [next];
      },
    };
    const remembered = await rememberFileHandle(store, existing);
    const savedAs = await runSaveAs({
      host,
      store,
      memory: remembered,
      filename: "New.resonance.json",
      json: "{}",
      fallbackDownload: () => {
        throw new Error("should use FSA");
      },
    });
    expect(saveCalls).toBe(1);
    expect(saveOpts?.startIn).toBe(dir);
    expect(savedAs.memory.lastFileName).toBe("New.resonance.json");
    expect(startInForPicker(savedAs.memory)).toBe(dir);

    const opened = await runOpen({ host, store, memory: savedAs.memory });
    expect(opened.kind).toBe("opened");
  });

  it("Ordner wählen stores the directory handle for the next picker", async () => {
    const dir: DirectoryHandleLike = { kind: "directory", name: "Resonance" };
    const store = createMemoryProjectFileStore();
    const host: PickerHost = {
      showDirectoryPicker: async (opts) => {
        expect(opts.startIn).toBe("documents");
        return dir;
      },
    };
    const picked = await runChooseFolder({
      host,
      store,
      memory: emptyProjectFileMemory(),
    });
    expect(picked.memory.directoryHandle).toBe(dir);
    expect(picked.status).toContain("Resonance");
    expect(statusHasFakePath(picked.status)).toBe(false);
    expect(startInForPicker(picked.memory)).toBe(dir);
    const again = await rememberDirectoryHandle(store, dir, picked.memory);
    expect(again.directoryHandle).toBe(dir);
  });

  it("opening a recent reuses the stored file handle", async () => {
    const dir: DirectoryHandleLike = { kind: "directory", name: "Recents" };
    const file = mockFileHandle("Live.resonance.json", { getParent: async () => dir });
    const store = createMemoryProjectFileStore();
    const memory = await rememberFileHandle(store, file);
    const opened = await runOpenRecent({ store, memory, recent: memory.recents[0] });
    expect(opened.kind).toBe("opened");
    if (opened.kind === "opened") {
      expect(opened.fileName).toBe("Live.resonance.json");
      expect(opened.memory.fileHandle).toBe(file);
      expect(startInForPicker(opened.memory)).toBe(dir);
    }
  });

  it("relink picker cancel is AbortError and names no path", async () => {
    expect(relinkAcceptAttr("video")).toBe("video/*");
    expect(relinkAcceptAttr("audio")).toBe("audio/*");
    expect(relinkAcceptAttr("image")).toBe("image/*");
    const host: PickerHost = {
      showOpenFilePicker: async () => {
        const err = new Error("The user aborted a request.");
        err.name = "AbortError";
        throw err;
      },
    };
    const result = await pickRelinkMediaFile({
      host,
      memory: emptyProjectFileMemory(),
      kind: "video",
    });
    expect(result).toEqual({ kind: "cancelled" });
  });
});
