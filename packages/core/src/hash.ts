/** FNV-1a 32-bit fingerprint used as a stable, non-cryptographic finding id. */
export function stableId(parts: string | string[]): string {
  const s = Array.isArray(parts) ? parts.join("|") : parts;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + s.length.toString(16).padStart(8, "0");
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
