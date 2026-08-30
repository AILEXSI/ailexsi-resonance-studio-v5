/**
 * Shorten MEDIA labels for the bin. Disk / asset.name stay unchanged.
 * UUID-looking stems become a 6-char prefix + ellipsis + extension.
 */
const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const LONG_HEX = /^[0-9a-f]{16,}$/i;

export function displayMediaName(name: string, max = 22): string {
  if (!name) return name;
  const extMatch = name.match(/(\.[A-Za-z0-9]{1,8})$/);
  const ext = extMatch?.[1] ?? "";
  const stem = ext ? name.slice(0, -ext.length) : name;
  if (UUID.test(stem) || LONG_HEX.test(stem)) {
    const prefix = stem.slice(0, 6);
    return `${prefix}…${ext}`;
  }
  if (name.length <= max) return name;
  const keep = Math.max(8, max - ext.length - 1);
  return `${stem.slice(0, keep)}…${ext}`;
}
