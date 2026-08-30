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
}

export interface DirectoryHandleLike {
  kind?: "directory";
  name?: string;
  queryPermission?: (opts?: { mode?: "read" | "readwrite" }) => Promise<PermissionState | string>;
  requestPermission?: (opts?: { mode?: "read" | "readwrite" }) => Promise<PermissionState | string>;
}

export type StartIn = DirectoryHandleLike | FileHandleLike | WellKnownStartIn;

export interface ProjectFileMemory {
  fileHandle: FileHandleLike | null;
  directoryHandle: DirectoryHandleLike | null;
  lastFileName: string | null;
}

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

export interface PickerHost {
  showSaveFilePicker?: (opts: SavePickerOptions) => Promise<FileHandleLike>;
  showOpenFilePicker?: (opts: OpenPickerOptions) => Promise<FileHandleLike[]>;
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
  return { fileHandle: null, directoryHandle: null, lastFileName: null };
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
  const memory: ProjectFileMemory = {
    fileHandle,
    directoryHandle,
    lastFileName: fileHandle.name,
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
  };
  return {
    showSaveFilePicker: rec?.showSaveFilePicker?.bind(w),
    showOpenFilePicker: rec?.showOpenFilePicker?.bind(w),
  };
}
