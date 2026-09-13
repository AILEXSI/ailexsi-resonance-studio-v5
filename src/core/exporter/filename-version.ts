/**
 * Automatic export/save filename versioning.
 *
 * Rules (locked by tests):
 * - Preferred suffix is `.vN` (lowercase v, no padding). `_vN` is recognized as the same series.
 * - Unversioned `Stem.ext` counts as version 1. First collision → `Stem.v2.ext`.
 * - Next number is one past the highest `.vN` / `_vN` (or implicit 1) for the same stem+ext.
 *   Gaps are not filled: v3 + v5 → v6.
 * - If the stem already ends with `.vN` / `_vN`, N is stripped; the next free value is used.
 * - No siblings and the proposed name is free → keep it (unversioned, or `.vN` if the stem had one).
 * - Other suffixes (`.short`, `.temp`, ` (1)`) are not versions and do not join the series.
 * - Matching is case-insensitive; output keeps the proposed stem/ext casing.
 * - Folders are the caller's job: pass only names from the chosen directory.
 */

const VERSION_SUFFIX = /[._]v(\d+)$/i;
const EXT_OK = /^[A-Za-z0-9]{1,8}$/;
const VERSION_AS_EXT = /^v\d+$/i;

export interface ParsedExportFileName {
  /** Stem with `.vN` / `_vN` stripped. */
  baseStem: string;
  /** Explicit `.vN` / `_vN`. Null when the file is unversioned. */
  version: number | null;
  /** Extension without the dot. Empty when there is no media extension. */
  ext: string;
}

export function sanitizeMediaExportStem(name: string): string {
  const safe = (name || "resonance").replace(/[^\w\-]+/g, "_");
  return safe || "untitled";
}

/** Same sanitizing as `jobFromProject` (dots in the project title become `_`). */
export function mediaExportFileName(projectName: string, ext = "mp4"): string {
  const suffix = ext.startsWith(".") ? ext.slice(1) : ext;
  const safe = sanitizeMediaExportStem(projectName);
  if (safe.toLowerCase().endsWith(`.${suffix.toLowerCase()}`)) return safe;
  return `${safe}.${suffix}`;
}

export function splitNameAndExt(fileName: string): { stem: string; ext: string } {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0) return { stem: trimmed, ext: "" };
  const ext = trimmed.slice(lastDot + 1);
  if (EXT_OK.test(ext) && !VERSION_AS_EXT.test(ext)) {
    return { stem: trimmed.slice(0, lastDot), ext };
  }
  return { stem: trimmed, ext: "" };
}

export function parseExportFileName(fileName: string): ParsedExportFileName {
  const { stem, ext } = splitNameAndExt(fileName);
  const match = stem.match(VERSION_SUFFIX);
  if (!match) {
    return { baseStem: stem || "untitled", version: null, ext };
  }
  const raw = match[1] ?? "";
  const version = Number(raw);
  if (!Number.isSafeInteger(version) || version < 0) {
    return { baseStem: stem || "untitled", version: null, ext };
  }
  const baseStem = stem.slice(0, stem.length - match[0].length) || "untitled";
  return { baseStem, version, ext };
}

export function formatExportFileName(baseStem: string, version: number | null, ext: string): string {
  const stem = baseStem || "untitled";
  const suffix = ext ? `.${ext}` : "";
  if (version == null || version <= 1) return `${stem}${suffix}`;
  return `${stem}.v${version}${suffix}`;
}

function sameExportFamily(a: ParsedExportFileName, b: ParsedExportFileName): boolean {
  return a.baseStem.toLowerCase() === b.baseStem.toLowerCase() && a.ext.toLowerCase() === b.ext.toLowerCase();
}

function occupiedVersion(parsed: ParsedExportFileName): number {
  return parsed.version ?? 1;
}

/**
 * Next free name in one folder. `existingNames` must be that folder only.
 * Unversioned sibling = v1; first bump is `.v2`.
 */
export function nextVersionedFileName(proposed: string, existingNames: readonly string[]): string {
  const trimmed = (proposed ?? "").trim() || "untitled.mp4";
  const parsed = parseExportFileName(trimmed);
  const occupied = new Set<string>();
  let highest = 0;
  let foundSibling = false;

  for (const raw of existingNames) {
    if (typeof raw !== "string") continue;
    const name = raw.trim();
    if (!name) continue;
    occupied.add(name.toLowerCase());
    const sibling = parseExportFileName(name);
    if (!sameExportFamily(parsed, sibling)) continue;
    foundSibling = true;
    const version = occupiedVersion(sibling);
    if (version > highest) highest = version;
  }

  const keepProposed = formatExportFileName(parsed.baseStem, parsed.version, parsed.ext);
  if (!foundSibling && !occupied.has(keepProposed.toLowerCase())) {
    return keepProposed;
  }

  let next = highest + 1;
  if (next < 2) next = 2;
  for (;;) {
    const candidate = formatExportFileName(parsed.baseStem, next, parsed.ext);
    if (!occupied.has(candidate.toLowerCase())) return candidate;
    next += 1;
  }
}

export function existingExportNamesFromMemory(memory: {
  lastExportFileName?: string | null;
  lastExportFileNames?: readonly string[] | null;
}): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const name = value.trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };
  push(memory.lastExportFileName);
  if (Array.isArray(memory.lastExportFileNames)) {
    for (const name of memory.lastExportFileNames) push(name);
  }
  return names;
}

/** Sync default-name path: project title + remembered export names + optional folder listing. */
export function readyExportNameFromProject(
  projectName: string,
  memory: {
    lastExportFileName?: string | null;
    lastExportFileNames?: readonly string[] | null;
  },
  listedNames: readonly string[] = [],
  ext = "mp4",
): string {
  return nextVersionedFileName(mediaExportFileName(projectName, ext), [
    ...existingExportNamesFromMemory(memory),
    ...listedNames,
  ]);
}
