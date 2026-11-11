import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Tiny disk + memory cache for third-party JSON (EDHREC, Commander Spellbook).
 * Keeps us polite to free APIs when several friends use the same server, and makes repeat
 * builds instant. Empty/failed results are never cached.
 *
 * Location: DECKBIT_CACHE_DIR if set; the OS temp dir on serverless hosts (Vercel, Netlify,
 * AWS Lambda — their project folder is read-only); otherwise ./.cache (gitignored).
 * Disk errors never break a request: the in-memory cache still works.
 */

const SERVERLESS = !!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DIR = process.env.DECKBIT_CACHE_DIR || (SERVERLESS ? path.join(os.tmpdir(), "deckbit-cache") : path.join(process.cwd(), ".cache"));
const mem = new Map<string, { t: number; v: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

function file(key: string) {
  return path.join(DIR, key.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 180) + ".json");
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T | null>): Promise<T | null> {
  const now = Date.now();
  const m = mem.get(key);
  if (m && now - m.t < ttlMs) return m.v as T;

  try {
    const raw = JSON.parse(await readFile(file(key), "utf8")) as { t: number; v: T };
    if (now - raw.t < ttlMs) {
      mem.set(key, raw);
      return raw.v;
    }
  } catch {
    /* miss */
  }

  const running = inflight.get(key);
  if (running) return running as Promise<T | null>;

  const p = (async () => {
    try {
      const v = await fn();
      if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
        const entry = { t: Date.now(), v };
        mem.set(key, entry);
        try {
          await mkdir(DIR, { recursive: true });
          await writeFile(file(key), JSON.stringify(entry));
        } catch {
          /* read-only or full disk: memory cache only */
        }
      }
      return v;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
