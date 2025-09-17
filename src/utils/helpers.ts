export const DAY_MS = 24 * 60 * 60 * 1000;

export const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

export const ensureSunday = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const t = new Date();
    const add = (7 - t.getDay()) % 7;
    return toISO(new Date(t.getTime() + add * DAY_MS));
  }
  const add = (7 - d.getDay()) % 7;
  return toISO(new Date(d.getTime() + add * DAY_MS));
};

export const uid = () => Math.random().toString(36).slice(2, 9);

export const asNumber = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export const asArray = <T = any,>(v: any, def: T[] = []) => (Array.isArray(v) ? (v as T[]) : def);

export function getQueryFlag(...keys: string[]) {
  const q = new URLSearchParams(window.location.search);
  return keys.some((k) => q.get(k) === "1" || q.get(k) === "true" || q.has(k));
}

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  // @ts-ignore
  if (!(window as any).crypto?.subtle) return `plain:${input}`;
  const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  const arr = Array.from(new Uint8Array(hashBuf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}
