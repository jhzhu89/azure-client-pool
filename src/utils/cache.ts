import TTLCache from "@isaacs/ttlcache";
import { createHash } from "crypto";
import { getLogger } from "../utils/logging.js";

const logger = getLogger("cache-manager");

const CACHE_KEY_TRUNCATE_LENGTH = 50;

interface Disposable {
  dispose?: () => void | Promise<void>;
  [Symbol.asyncDispose]?: () => Promise<void>;
  [Symbol.dispose]?: () => void;
}

function hasDispose(obj: unknown): obj is Disposable {
  return (
    obj != null &&
    typeof obj === "object" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (typeof (obj as any).dispose === "function" ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (obj as any)[Symbol.asyncDispose] === "function" ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (obj as any)[Symbol.dispose] === "function")
  );
}

export interface CacheConfig {
  maxSize: number;
  slidingTtl: number;
}

export interface CacheOptions {
  slidingTtl?: number;
  absoluteTtl?: number;
  contextInfo?: Record<string, unknown>;
}

interface CacheEntry<T> {
  value: T;
  absoluteExpiresAt?: number;
}

export class CacheManager<T> {
  private cache: TTLCache<string, CacheEntry<T>>;
  private pendingRequests: Map<string, Promise<T>>;
  private slidingTtl: number;

  constructor(
    config: CacheConfig,
    private cacheType: string,
  ) {
    this.pendingRequests = new Map();
    this.slidingTtl = config.slidingTtl;

    this.cache = new TTLCache<string, CacheEntry<T>>({
      max: config.maxSize,
      ttl: config.slidingTtl,
      updateAgeOnGet: true,
      checkAgeOnGet: true,
      dispose: (entry: CacheEntry<T>, key: string, reason: string) => {
        this.disposeEntry(entry, key, reason).catch((error: unknown) => {
          logger.error(`Error disposing ${this.cacheType} cache entry`, {
            cacheType: this.cacheType,
            cacheKey: this.createLoggableKey(key),
            error: error instanceof Error ? error.message : String(error),
            reason,
          });
        });
      },
    });
  }

  private async disposeEntry(
    entry: CacheEntry<T>,
    cacheKey: string,
    reason: string,
  ): Promise<void> {
    if (!hasDispose(entry.value)) {
      return;
    }

    try {
      logger.debug(`Disposing ${this.cacheType} cache entry`, {
        cacheType: this.cacheType,
        cacheKey: this.createLoggableKey(cacheKey),
        reason,
        valueType: entry.value?.constructor?.name || "Unknown",
      });

      const value = entry.value as Disposable;

      if (value[Symbol.asyncDispose]) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        await value[Symbol.asyncDispose]!();
      } else if (value[Symbol.dispose]) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        value[Symbol.dispose]!();
      } else if (value.dispose) {
        await value.dispose();
      }

      logger.debug(`${this.cacheType} cache entry disposed successfully`, {
        cacheType: this.cacheType,
        cacheKey: this.createLoggableKey(cacheKey),
        reason,
      });
    } catch (error) {
      logger.warn(
        `${this.cacheType} cache entry dispose failed, continuing cleanup`,
        {
          cacheType: this.cacheType,
          cacheKey: this.createLoggableKey(cacheKey),
          error: error instanceof Error ? error.message : String(error),
          reason,
        },
      );
    }
  }

  private createCacheEntry(value: T, absoluteTtl?: number): CacheEntry<T> {
    const entry: CacheEntry<T> = { value };
    if (absoluteTtl !== undefined) {
      entry.absoluteExpiresAt = Date.now() + absoluteTtl;
    }
    return entry;
  }

  async getOrCreate(
    cacheKey: string,
    factory: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // Check if cached item has expired based on its absolute TTL
      if (
        cached.absoluteExpiresAt !== undefined &&
        cached.absoluteExpiresAt <= Date.now()
      ) {
        return this.createInternal(cacheKey, factory, options);
      }

      logger.debug(`${this.cacheType} cache hit`, {
        cacheKey: this.createLoggableKey(cacheKey),
        ...options?.contextInfo,
      });
      return cached.value;
    }

    const existingPromise = this.pendingRequests.get(cacheKey);
    if (existingPromise) {
      logger.debug(`Found pending ${this.cacheType} request`, {
        cacheKey: this.createLoggableKey(cacheKey),
        ...options?.contextInfo,
      });
      return existingPromise;
    }

    logger.debug(`${this.cacheType} cache miss, creating new entry`, {
      cacheKey: this.createLoggableKey(cacheKey),
      ...options?.contextInfo,
    });

    const promise = this.createInternal(cacheKey, factory, options);
    this.pendingRequests.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private async createInternal(
    cacheKey: string,
    factory: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const value = await factory();

    let slidingTtl = options?.slidingTtl ?? this.slidingTtl;
    const absoluteTtl = options?.absoluteTtl;

    if (absoluteTtl !== undefined && absoluteTtl <= 0) {
      this.cache.delete(cacheKey);
      return value;
    }

    if (absoluteTtl !== undefined && slidingTtl > absoluteTtl) {
      logger.debug(
        `${this.cacheType} slidingTtl adjusted from ${slidingTtl}ms to ${absoluteTtl}ms`,
        {
          cacheKey: this.createLoggableKey(cacheKey),
        },
      );
      slidingTtl = absoluteTtl;
    }

    const effectiveTtl = Math.max(slidingTtl, 1);

    const entry = this.createCacheEntry(value, absoluteTtl);
    this.cache.set(cacheKey, entry, { ttl: effectiveTtl });

    const logData: Record<string, unknown> = {
      cacheKey: this.createLoggableKey(cacheKey),
      slidingTTL: slidingTtl,
      effectiveTTL: effectiveTtl,
      ...options?.contextInfo,
    };

    if (absoluteTtl !== undefined) {
      logData.absoluteTTL = absoluteTtl;
    }

    logger.debug(`${this.cacheType} entry created and cached`, logData);

    return value;
  }

  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
    logger.debug(`${this.cacheType} cache cleared`);
  }

  delete(cacheKey: string): boolean {
    const deleted = this.cache.delete(cacheKey);
    logger.debug(`${this.cacheType} cache entry removed`, {
      cacheKey: this.createLoggableKey(cacheKey),
      deleted,
      cacheSize: this.cache.size,
    });
    return deleted;
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
      pendingRequests: this.pendingRequests.size,
    };
  }

  private createLoggableKey(rawKey: string): string {
    return rawKey.length > CACHE_KEY_TRUNCATE_LENGTH
      ? rawKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
      : rawKey;
  }
}

export function createStableCacheKey(rawKey: string): string {
  return createHash("md5").update(rawKey, "utf8").digest("base64url");
}
