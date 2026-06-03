/** Helpers for Entavi's QR-based "call code" flow. */

const HOST = "entavi.app";

/** Display URL for a call code, e.g. `entavi.app/c/abc123` (no scheme). */
export function callUrl(code: string): string {
  return `${HOST}/c/${code}`;
}

/** Full URL encoded into the QR, e.g. `https://entavi.app/c/abc123`. */
export function callLink(code: string): string {
  return `https://${callUrl(code)}`;
}

/**
 * Extract a call code from a pasted/scanned value. Accepts a full link
 * (`https://entavi.app/c/CODE`), a bare path (`entavi.app/c/CODE`), or the
 * code itself. Returns the normalized code, or '' if nothing usable.
 */
export function parseCode(input: string): string {
  let value = input.trim();
  if (!value) return "";

  // Strip query/hash if present.
  value = value.split(/[?#]/)[0];

  // If it looks like a link/path, take the segment after `/c/`, else the last path segment.
  if (value.includes("/c/")) {
    value = value.slice(value.lastIndexOf("/c/") + 3);
  } else if (value.includes("/")) {
    value = value.slice(value.lastIndexOf("/") + 1);
  }

  // Keep only safe code characters.
  value = value.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  return value;
}
