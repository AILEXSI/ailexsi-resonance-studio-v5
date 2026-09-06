import { describe, expect, it } from "vitest";
import {
  fileNameFromPath,
  lastProjectMissingStatus,
  lastProjectPayload,
  normalizeLastProjectPath,
  parseLastProject,
  parseLastProjectText,
} from "../../src/core/last-project";
import {
  autostartLastProject,
  tauriOpenProject,
  tauriSaveProject,
  type TauriProjectFs,
} from "../../src/core/tauri-project-io";
import { isTauriRuntime } from "../../src/core/tauri-runtime";

function mockFs(overrides: Partial<TauriProjectFs> = {}): TauriProjectFs & {
  appWrites: Array<{ name: string; text: string }>;
} {
  const appWrites: Array<{ name: string; text: string }> = [];
  return {
    appWrites,
    async openDialog() {
      return null;
    },
    async saveDialog() {
      return null;
    },
    async readText() {
      throw new Error("not found");
    },
    async writeText() {
      throw new Error("write denied");
    },
    async exists() {
      return false;
    },
    async readAppDataText() {
      throw new Error("no last-project");
    },
    async writeAppDataText(name, text) {
      appWrites.push({ name, text });
    },
    async appDataExists() {
      return false;
    },
    ...overrides,
  };
}

describe("last-project path normalize", () => {
  it("normalizes Windows slash variants to backslash", () => {
    expect(normalizeLastProjectPath("C:/Users/marti/Song.resonance.json")).toBe(
      "C:\\Users\\marti\\Song.resonance.json",
    );
    expect(normalizeLastProjectPath("C:\\Users\\marti\\Song.resonance.json")).toBe(
      "C:\\Users\\marti\\Song.resonance.json",
    );
    expect(normalizeLastProjectPath("C:/Users//marti\\\\Song.resonance.json")).toBe(
      "C:\\Users\\marti\\Song.resonance.json",
    );
  });

  it("rejects empty and non-string paths", () => {
    expect(normalizeLastProjectPath("")).toBe("");
    expect(normalizeLastProjectPath("   ")).toBe("");
    expect(normalizeLastProjectPath(null)).toBe("");
    expect(normalizeLastProjectPath(undefined)).toBe("");
    expect(normalizeLastProjectPath(42)).toBe("");
    expect(normalizeLastProjectPath({ path: "C:\\x.json" })).toBe("");
  });

  it("parses last-project.json and never treats a handle as a path", () => {
    const parsed = parseLastProject({
      path: "C:/Users/marti/Live.resonance.json",
      name: "Live.resonance.json",
    });
    expect(parsed).toEqual({
      path: "C:\\Users\\marti\\Live.resonance.json",
      name: "Live.resonance.json",
    });
    expect(parseLastProject({ handle: {}, name: "x.json" })).toBeNull();
    expect(parseLastProjectText('{ "name": "x.json" }')).toBeNull();
    expect(parseLastProjectText("not-json")).toBeNull();
    expect(lastProjectPayload({ path: "C:/a/b.json", name: "ignored.json" })).toEqual({
      path: "C:\\a\\b.json",
      name: "ignored.json",
    });
    expect(fileNameFromPath("C:\\shows\\night.resonance.json")).toBe("night.resonance.json");
  });

  it("missing-file status uses the project name, not a raw disk path", () => {
    const status = lastProjectMissingStatus("Show A.resonance.json");
    expect(status).toBe("Zuletzt: Show A.resonance.json — Datei nicht gefunden, Öffnen oder Relink");
    expect(status).not.toMatch(/C:\\/i);
  });
});

describe("autostart last-project", () => {
  it("returns missing status and does not write when the remembered file is gone", async () => {
    const fs = mockFs({
      async appDataExists() {
        return true;
      },
      async readAppDataText() {
        return JSON.stringify({
          path: "C:\\Users\\marti\\Gone.resonance.json",
          name: "Gone.resonance.json",
        });
      },
      async exists() {
        return false;
      },
    });
    const result = await autostartLastProject(fs);
    expect(result.kind).toBe("missing");
    if (result.kind === "missing") {
      expect(result.status).toBe(
        "Zuletzt: Gone.resonance.json — Datei nicht gefunden, Öffnen oder Relink",
      );
    }
    expect(fs.appWrites).toHaveLength(0);
  });

  it("loads JSON when the path exists and does not overwrite last-project", async () => {
    const fs = mockFs({
      async appDataExists() {
        return true;
      },
      async readAppDataText() {
        return JSON.stringify({
          path: "C:/Users/marti/From Disk.resonance.json",
          name: "From Disk.resonance.json",
        });
      },
      async exists() {
        return true;
      },
      async readText() {
        return JSON.stringify({
          version: 1,
          name: "From Disk",
          assets: [],
          scenes: [],
          timeline: { duration: 1, cues: [] },
        });
      },
    });
    const result = await autostartLastProject(fs);
    expect(result.kind).toBe("loaded");
    if (result.kind === "loaded") {
      expect(result.ref.path).toBe("C:\\Users\\marti\\From Disk.resonance.json");
      expect(result.ref.name).toBe("From Disk.resonance.json");
      expect(JSON.parse(result.text).name).toBe("From Disk");
    }
    expect(fs.appWrites).toHaveLength(0);
  });
});

describe("tauri save/open last-path", () => {
  it("writes last-project.json after a successful save", async () => {
    const fs = mockFs({
      async saveDialog() {
        return "C:/Users/marti/Show.resonance.json";
      },
      async writeText() {
        /* project json */
      },
    });
    const result = await tauriSaveProject(fs, {
      json: "{}",
      filename: "Show.resonance.json",
    });
    expect("cancelled" in result).toBe(false);
    if (!("cancelled" in result)) {
      expect(result.path).toBe("C:\\Users\\marti\\Show.resonance.json");
      expect(result.name).toBe("Show.resonance.json");
    }
    expect(fs.appWrites).toHaveLength(1);
    expect(fs.appWrites[0]?.name).toBe("last-project.json");
    expect(JSON.parse(fs.appWrites[0]?.text ?? "{}")).toEqual({
      path: "C:\\Users\\marti\\Show.resonance.json",
      name: "Show.resonance.json",
    });
  });

  it("writes last-project.json after a successful open", async () => {
    const fs = mockFs({
      async openDialog() {
        return "C:\\Users\\marti\\Open.resonance.json";
      },
      async readText() {
        return "{\"name\":\"Open\"}";
      },
    });
    const result = await tauriOpenProject(fs);
    expect("cancelled" in result).toBe(false);
    if (!("cancelled" in result)) {
      expect(result.path).toBe("C:\\Users\\marti\\Open.resonance.json");
      expect(result.name).toBe("Open.resonance.json");
    }
    expect(JSON.parse(fs.appWrites[0]?.text ?? "{}")).toEqual({
      path: "C:\\Users\\marti\\Open.resonance.json",
      name: "Open.resonance.json",
    });
  });
});

describe("tauri runtime detect", () => {
  it("is false without __TAURI_INTERNALS__ so Chrome FSA stays the fallback", () => {
    expect(isTauriRuntime({})).toBe(false);
    expect(isTauriRuntime({ __TAURI_INTERNALS__: {} })).toBe(true);
  });
});
