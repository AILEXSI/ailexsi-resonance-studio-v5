/** Well-known startIn. First run uses documents — never invent a C:\ path. */
export const DEFAULT_START_IN = "documents" as const;

export type WellKnownStartIn = "documents" | "music" | "downloads" | "desktop";

export interface FileHandleLike {
  name: string;
  kind?: "file";
  createWritable?: () => Promise<{
    write: (data: Blob | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
  getFile?: () => Promise<File>;
  getParent?: () => Promise<DirectoryHandleLike>;
  queryPermission?: (opts?: { mode?: "read" | "readwrite" }) => Promise<PermissionState | string>;
  requestPermission?: (opts?: { mode?: "read" | "readwrite" }) => Promise<PermissionState | string>;
  isSameEntry?: (other: FileHandleLike) => Promise<boolean>;
}

export interface DirectoryHandleLike {
  kind?: "directory";
  name?: string;
  queryPermission?: (opts?: { mode?: "read" | "readwrite" }) => Promise<PermissionState | string>;
  requestPermission?: (opts?: { mode?: "read" | "readwrite" }) => Promise<PermissionState | string>;
}

export type StartIn = DirectoryHandleLike | FileHandleLike | WellKnownStartIn;

export interface RecentProject {
  fileHandle: FileHandleLike;
  directoryHandle: DirectoryHandleLike | null;
  lastFileName: string;
}

export interface ProjectFileMemory {
  fileHandle: FileHandleLike | null;
  directoryHandle: DirectoryHandleLike | null;
  lastFileName: string | null;
  recents: RecentProject[];
}

export const MAX_RECENT_PROJECTS = 8;

export interface SavePickerOptions {
  suggestedName: string;
  startIn: StartIn;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}

export interface OpenPickerOptions {
  multiple: boolean;
  startIn: StartIn;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}

export interface DirectoryPickerOptions {
  startIn: StartIn;
  mode?: "read" | "readwrite";
}

export interface PickerHost {
  showSaveFilePicker?: (opts: SavePickerOptions) => Promise<FileHandleLike>;
  showOpenFilePicker?: (opts: OpenPickerOptions) => Promise<FileHandleLike[]>;
  showDirectoryPicker?: (opts: DirectoryPickerOptions) => Promise<DirectoryHandleLike>;
}

export interface ProjectFileStore {
  load(): Promise<ProjectFileMemory>;
  save(memory: ProjectFileMemory): Promise<void>;
}

const PROJECT_TYPES = [
  {
    description: "Resonance project",
    accept: { "application/json": [".resonance.json", ".json"] },
  },
];

export function emptyProjectFileMemory(): ProjectFileMemory {
  return { fileHandle: null, directoryHandle: null, lastFileName: null, recents: [] };
}

export function normalizeProjectFileMemory(
  raw: Partial<ProjectFileMemory> | null | undefined,
): ProjectFileMemory {
  if (!raw) return emptyProjectFileMemory();
  const recents = Array.isArray(raw.recents)
    ? raw.recents
        .filter((row): row is RecentProject =>
          Boolean(row && row.fileHandle && typeof row.lastFileName === "string" && row.lastFileName),
        )
        .slice(0, MAX_RECENT_PROJECTS)
    : [];
  return {
    fileHandle: raw.fileHandle ?? null,
    directoryHandle: raw.directoryHandle ?? null,
    lastFileName: raw.lastFileName ?? null,
    recents,
  };
}

export function upsertRecent(recents: RecentProject[], entry: RecentProject): RecentProject[] {
  const rest = recents.filter((row) => row.lastFileName !== entry.lastFileName);
  return [entry, ...rest].slice(0, MAX_RECENT_PROJECTS);
}

/** Panel copy only — never invent a drive letter or /Users path. */
export function projectPanelView(memory: ProjectFileMemory): {
  fileName: string;
  folderLabel: string;
  folderRemembered: boolean;
} {
  const fileName = memory.lastFileName ?? memory.fileHandle?.name ?? null;
  const dirName =
    typeof memory.directoryHandle?.name === "string" && memory.directoryHandle.name.length > 0
      ? memory.directoryHandle.name
      : null;
  const folderRemembered = Boolean(memory.directoryHandle || memory.fileHandle);
  if (dirName) {
    return {
      fileName: fileName ?? "Noch nicht gespeichert",
      folderLabel: dirName,
      folderRemembered: true,
    };
  }
  if (folderRemembered && fileName) {
    return {
      fileName,
      folderLabel: `${fileName} — Ordner gemerkt`,
      folderRemembered: true,
    };
  }
  if (folderRemembered) {
    return {
      fileName: fileName ?? "Noch nicht gespeichert",
      folderLabel: "Ordner gemerkt",
      folderRemembered: true,
    };
  }
  return {
    fileName: fileName ?? "Noch nicht gespeichert",
    folderLabel: "Kein Ordner gemerkt",
    folderRemembered: false,
  };
}

export function hasFileSystemAccess(host: PickerHost): boolean {
  return typeof host.showSaveFilePicker === "function" && typeof host.showOpenFilePicker === "function";
}

/** Last project folder if we have a handle; otherwise documents. */
export function startInForPicker(memory: ProjectFileMemory): StartIn {
  return memory.directoryHandle ?? memory.fileHandle ?? DEFAULT_START_IN;
}

export function savePickerOptions(suggestedName: string, memory: ProjectFileMemory): SavePickerOptions {
  return {
    suggestedName,
    startIn: startInForPicker(memory),
    types: PROJECT_TYPES,
  };
}

export function openPickerOptions(memory: ProjectFileMemory): OpenPickerOptions {
  return {
    multiple: false,
    startIn: startInForPicker(memory),
    types: PROJECT_TYPES,
  };
}

export function saveStatusFsa(fileName: string): string {
  return `Gespeichert: ${fileName} — Projektordner gemerkt`;
}

export function loadStatusFsa(fileName: string): string {
  return `Geladen: ${fileName}`;
}

export function saveStatusFallback(fileName: string): string {
  return `Gespeichert: ${fileName} — Browser-Downloads (Pfad unbekannt)`;
}

export function loadStatusFallback(fileName: string): string {
  return `Geladen: ${fileName} — Datei gewählt (Pfad unbekannt)`;
}

export function lastLoadedStatus(fileName: string): string {
  return `Zuletzt geladen: ${fileName} — Öffnen klicken`;
}

export function statusHasFakePath(status: string): boolean {
  return /[A-Za-z]:[\\/]/.test(status) || /\/home\//.test(status) || /\/Users\//.test(status);
}

export async function queryGranted(
  handle: { queryPermission?: FileHandleLike["queryPermission"] } | null,
  mode: "read" | "readwrite",
): Promise<boolean> {
  if (!handle?.queryPermission) return false;
  try {
    return (await handle.queryPermission({ mode })) === "granted";
  } catch {
    return false;
  }
}

export async function directoryOf(file: FileHandleLike): Promise<DirectoryHandleLike | null> {
  if (typeof file.getParent !== "function") return null;
  try {
    return await file.getParent();
  } catch {
    return null;
  }
}

export async function rememberFileHandle(
  store: ProjectFileStore,
  fileHandle: FileHandleLike,
  previous: ProjectFileMemory = emptyProjectFileMemory(),
): Promise<ProjectFileMemory> {
  const directoryHandle = (await directoryOf(fileHandle)) ?? previous.directoryHandle;
  const lastFileName = fileHandle.name;
  const recent: RecentProject = { fileHandle, directoryHandle, lastFileName };
  const memory: ProjectFileMemory = {
    fileHandle,
    directoryHandle,
    lastFileName,
    recents: upsertRecent(previous.recents ?? [], recent),
  };
  await store.save(memory);
  return memory;
}

export async function rememberDirectoryHandle(
  store: ProjectFileStore,
  directoryHandle: DirectoryHandleLike,
  previous: ProjectFileMemory = emptyProjectFileMemory(),
): Promise<ProjectFileMemory> {
  const memory: ProjectFileMemory = {
    ...normalizeProjectFileMemory(previous),
    directoryHandle,
  };
  await store.save(memory);
  return memory;
}

export async function tryReadGrantedFile(
  memory: ProjectFileMemory,
): Promise<{ kind: "ready"; text: string; fileName: string } | { kind: "needsOpen"; fileName: string } | null> {
  if (!memory.lastFileName && !memory.fileHandle) return null;
  const name = memory.fileHandle?.name ?? memory.lastFileName;
  if (!name) return null;
  if (!memory.fileHandle) return { kind: "needsOpen", fileName: name };
  const granted = await queryGranted(memory.fileHandle, "read");
  if (!granted || typeof memory.fileHandle.getFile !== "function") {
    return { kind: "needsOpen", fileName: name };
  }
  try {
    const file = await memory.fileHandle.getFile();
    return { kind: "ready", text: await readFileText(file), fileName: file.name || name };
  } catch {
    return { kind: "needsOpen", fileName: name };
  }
}

export async function runSave(opts: {
  host: PickerHost;
  store: ProjectFileStore;
  memory: ProjectFileMemory;
  filename: string;
  json: string;
  fallbackDownload: (filename: string, text: string) => void;
}): Promise<{ status: string; memory: ProjectFileMemory; usedFallback: boolean; cancelled?: boolean }> {
  if (!hasFileSystemAccess(opts.host) || !opts.host.showSaveFilePicker) {
    opts.fallbackDownload(opts.filename, opts.json);
    return {
      status: saveStatusFallback(opts.filename),
      memory: { ...opts.memory, lastFileName: opts.filename },
      usedFallback: true,
    };
  }

  let handle = opts.memory.fileHandle;
  const canWrite = handle ? await queryGranted(handle, "readwrite") : false;
  if (!handle || !canWrite || typeof handle.createWritable !== "function") {
    try {
      handle = await opts.host.showSaveFilePicker(savePickerOptions(opts.filename, opts.memory));
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "AbortError") {
        return { status: "", memory: opts.memory, usedFallback: false, cancelled: true };
      }
      throw e;
    }
  }
  if (!handle.createWritable) {
    opts.fallbackDownload(handle.name || opts.filename, opts.json);
    return {
      status: saveStatusFallback(handle.name || opts.filename),
      memory: opts.memory,
      usedFallback: true,
    };
  }
  const writable = await handle.createWritable();
  await writable.write(opts.json);
  await writable.close();
  const memory = await rememberFileHandle(opts.store, handle, opts.memory);
  return { status: saveStatusFsa(handle.name), memory, usedFallback: false };
}

/** Always open the save picker (Speichern unter). startIn is the last folder. */
export async function runSaveAs(opts: {
  host: PickerHost;
  store: ProjectFileStore;
  memory: ProjectFileMemory;
  filename: string;
  json: string;
  fallbackDownload: (filename: string, text: string) => void;
}): Promise<{ status: string; memory: ProjectFileMemory; usedFallback: boolean; cancelled?: boolean }> {
  return runSave({
    ...opts,
    memory: { ...normalizeProjectFileMemory(opts.memory), fileHandle: null },
  });
}

export async function runChooseFolder(opts: {
  host: PickerHost;
  store: ProjectFileStore;
  memory: ProjectFileMemory;
}): Promise<{ memory: ProjectFileMemory; status: string; cancelled?: boolean }> {
  if (typeof opts.host.showDirectoryPicker !== "function") {
    return { memory: opts.memory, status: "Ordner wählen nicht verfügbar" };
  }
  try {
    const directoryHandle = await opts.host.showDirectoryPicker({
      startIn: startInForPicker(opts.memory),
      mode: "readwrite",
    });
    const memory = await rememberDirectoryHandle(opts.store, directoryHandle, opts.memory);
    const name = directoryHandle.name;
    return {
      memory,
      status: name ? `Ordner gemerkt: ${name}` : "Ordner gemerkt",
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError") {
      return { memory: opts.memory, status: "", cancelled: true };
    }
    throw e;
  }
}

export async function runOpenRecent(opts: {
  store: ProjectFileStore;
  memory: ProjectFileMemory;
  recent: RecentProject;
}): Promise<
  | { kind: "opened"; text: string; fileName: string; status: string; memory: ProjectFileMemory }
  | { kind: "needsPicker" }
> {
  const handle = opts.recent.fileHandle;
  if (handle.requestPermission) {
    try {
      const perm = await handle.requestPermission({ mode: "read" });
      if (perm !== "granted") return { kind: "needsPicker" };
    } catch {
      return { kind: "needsPicker" };
    }
  }
  if (typeof handle.getFile !== "function") return { kind: "needsPicker" };
  try {
    const file = await handle.getFile();
    const text = await readFileText(file);
    const previous: ProjectFileMemory = {
      ...normalizeProjectFileMemory(opts.memory),
      directoryHandle: opts.recent.directoryHandle ?? opts.memory.directoryHandle,
    };
    const memory = await rememberFileHandle(opts.store, handle, previous);
    const fileName = file.name || handle.name;
    return { kind: "opened", text, fileName, status: loadStatusFsa(fileName), memory };
  } catch {
    return { kind: "needsPicker" };
  }
}

export async function runOpen(opts: {
  host: PickerHost;
  store: ProjectFileStore;
  memory: ProjectFileMemory;
}): Promise<
  | { kind: "opened"; text: string; fileName: string; status: string; memory: ProjectFileMemory }
  | { kind: "fallback" }
  | { kind: "cancelled" }
> {
  if (!hasFileSystemAccess(opts.host) || !opts.host.showOpenFilePicker) {
    return { kind: "fallback" };
  }
  try {
    const [handle] = await opts.host.showOpenFilePicker(openPickerOptions(opts.memory));
    if (!handle?.getFile) return { kind: "cancelled" };
    const file = await handle.getFile();
    const text = await readFileText(file);
    const memory = await rememberFileHandle(opts.store, handle, opts.memory);
    const fileName = file.name || handle.name;
    return { kind: "opened", text, fileName, status: loadStatusFsa(fileName), memory };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError") return { kind: "cancelled" };
    throw e;
  }
}

export async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Response(file).text();
}

export function browserPickerHost(): PickerHost {
  const w = typeof window !== "undefined" ? window : undefined;
  const rec = w as unknown as {
    showSaveFilePicker?: PickerHost["showSaveFilePicker"];
    showOpenFilePicker?: PickerHost["showOpenFilePicker"];
    showDirectoryPicker?: PickerHost["showDirectoryPicker"];
  };
  return {
    showSaveFilePicker: rec?.showSaveFilePicker?.bind(w),
    showOpenFilePicker: rec?.showOpenFilePicker?.bind(w),
    showDirectoryPicker: rec?.showDirectoryPicker?.bind(w),
  };
}
