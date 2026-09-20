import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeFileAtomic } from './atomicWrite';

const CACHE_FORMAT_VERSION = 1;
const KEY_PATTERN = /^[0-9a-f]{64}$/;

/** Identifies who is asking; part of every cache key so entries never leak across agents, models or orgs. */
export interface CacheKeyContext {
  agent: string;
  model: string;
  orgId: string;
}

interface CacheEntry {
  v: number;
  key: string;
  createdAt: string;
  value: string;
}

/**
 * Default cache location: SIBYL_AGENT_CACHE_DIR, else a per-user directory
 * (~/.sibyl/agent-cache). A per-user path is independent of the working
 * directory and never lands inside a repository where it could be committed.
 */
export function defaultCacheDir(): string {
  const fromEnv = process.env.SIBYL_AGENT_CACHE_DIR?.trim();
  return fromEnv || path.join(os.homedir(), '.sibyl', 'agent-cache');
}

/** JSON encoding with sorted object keys so logically equal inputs hash identically. */
function stableStringify(value: unknown): string | undefined {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (v as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return v;
  });
}

/** Tagged encoding so that undefined, null and the string "null" all stay distinct. */
function encodeInput(input: unknown): [string, string] {
  if (input === undefined) return ['u', ''];
  const json = stableStringify(input);
  return json === undefined ? ['u', typeof input] : ['j', json];
}

export class CacheManager {
  private cacheDir: string;
  private memoryCache: Map<string, string> = new Map();

  constructor(cacheDir: string = defaultCacheDir()) {
    this.cacheDir = cacheDir;
  }

  public generateKey(context: CacheKeyContext, ...inputs: unknown[]): string {
    const payload = JSON.stringify({
      v: CACHE_FORMAT_VERSION,
      agent: context.agent,
      model: context.model,
      orgId: context.orgId,
      inputs: inputs.map(encodeInput),
    });
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /** Returns the cached value, or null on a miss. Unreadable or malformed entries are misses. */
  public get(key: string): string | null {
    if (!KEY_PATTERN.test(key)) return null;
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key) ?? null;
    }

    const filePath = this.filePath(key);
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }

    try {
      const entry = JSON.parse(raw) as Partial<CacheEntry>;
      if (
        !entry || typeof entry !== 'object' ||
        entry.v !== CACHE_FORMAT_VERSION ||
        entry.key !== key ||
        typeof entry.value !== 'string'
      ) {
        return null;
      }
      this.memoryCache.set(key, entry.value);
      return entry.value;
    } catch {
      return null;
    }
  }

  /** Best-effort write; a cache write failure never fails the caller. */
  public set(key: string, value: string): void {
    if (!KEY_PATTERN.test(key)) return;
    this.memoryCache.set(key, value);
    const entry: CacheEntry = { v: CACHE_FORMAT_VERSION, key, createdAt: new Date().toISOString(), value };
    try {
      writeFileAtomic(this.filePath(key), JSON.stringify(entry));
    } catch {
      // ignore: the in-memory copy still serves this process
    }
  }

  private filePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }
}
