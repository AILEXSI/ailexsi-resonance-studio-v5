/** AppData last-project.json. String path only — never a FileHandle. */

export const LAST_PROJECT_FILENAME = "last-project.json";

export interface LastProjectRef {
  path: string;
  name: string;
}

export function fileNameFromPath(path: string): string {
  const norm = normalizeLastProjectPath(path);
  if (!norm) return "";
  const parts = norm.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Normalize a remembered Windows or POSIX path. Empty / non-string → "". */
export function normalizeLastProjectPath(path: unknown): string {
  if (typeof path !== "string") return "";
  const trimmed = path.trim();
  if (!trimmed) return "";
  const windows = /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.includes("\\");
  let next = windows ? trimmed.replace(/\//g, "\\") : trimmed.replace(/\\/g, "/");
  if (windows) {
    if (next.startsWith("\\\\")) {
      next = `\\\\${next.slice(2).replace(/\\+/g, "\\")}`;
    } else {
      next = next.replace(/\\+/g, "\\");
    }
    if (/^[A-Za-z]:\\$/.test(next)) return next;
    return next.replace(/\\+$/, "");
  }
  if (next !== "/") next = next.replace(/\/+$/, "");
  return next.replace(/\/{2,}/g, "/");
}

export function parseLastProject(raw: unknown): LastProjectRef | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const path = normalizeLastProjectPath(rec.path);
  if (!path) return null;
  const name =
    typeof rec.name === "string" && rec.name.trim()
      ? rec.name.trim()
      : fileNameFromPath(path);
  if (!name) return null;
  return { path, name };
}

export function parseLastProjectText(text: string): LastProjectRef | null {
  try {
    return parseLastProject(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export function lastProjectPayload(ref: LastProjectRef): LastProjectRef {
  return {
    path: normalizeLastProjectPath(ref.path),
    name: ref.name.trim() || fileNameFromPath(ref.path),
  };
}

export function lastProjectMissingStatus(name: string): string {
  return `Zuletzt: ${name} — Datei nicht gefunden, Öffnen oder Relink`;
}
