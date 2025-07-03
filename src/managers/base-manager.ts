import TTLCache from "@isaacs/ttlcache";
import { createHash } from "crypto";
import { type TokenCredential } from "@azure/identity";
import { type ClientFactory } from "../types/client-types.js";
import { type ClientManagerConfig } from "../config/configuration.js";
import { type CredentialProvider } from "../providers/credential-types.js";
import { getLogger } from "../utils/logging.js";

const logger = getLogger("client-manager");

const CACHE_KEY_TRUNCATE_LENGTH = 50;

interface Disposable {
  dispose?: () => void | Promise<void>;
  [Symbol.asyncDispose]?: () => Promise<void>;
  [Symbol.dispose]?: () => void;
}

interface CredentialCacheEntry {
  credential: TokenCredential;
  absoluteExpiresAt: number;
}

interface ClientCacheEntry<TClient> {
  client: TClient;
}

function createStableCacheKey(rawKey: string): string {
  return createHash("md5").update(rawKey, "utf8").digest("base64url");
}

function createLoggableKey(rawKey: string): string {
  return rawKey.length > CACHE_KEY_TRUNCATE_LENGTH
    ? rawKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
    : rawKey;
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

export abstract class BaseClientManager<TClient, TContext, TOptions = void> {
  protected clientCache: TTLCache<string, ClientCacheEntry<TClient>>;
  protected credentialCache: TTLCache<string, CredentialCacheEntry>;
  protected pendingRequests: Map<string, Promise<TClient>>;
  protected pendingCredentials: Map<string, Promise<TokenCredential>>;

  constructor(
    private provider: CredentialProvider<TContext>,
    protected clientFactory: ClientFactory<TClient, TOptions>,
    protected config: ClientManagerConfig,
  ) {
    this.pendingRequests = new Map();
    this.pendingCredentials = new Map();

    this.credentialCache = new TTLCache<string, CredentialCacheEntry>({
      max: this.config.credentialCache.maxSize,
      ttl: this.config.credentialCache.slidingTtl,
      updateAgeOnGet: true,
      checkAgeOnGet: true,
    });

    this.clientCache = new TTLCache<string, ClientCacheEntry<TClient>>({
      max: this.config.clientCache.maxSize,
      ttl: this.config.clientCache.slidingTtl,
      updateAgeOnGet: true,
      checkAgeOnGet: true,
      dispose: (
        value: ClientCacheEntry<TClient>,
        key: string,
        reason: string,
      ) => {
        this.disposeClientEntry(value, key, reason).catch((error: unknown) => {
          logger.error(`Error disposing client`, {
            authMode: this.getAuthMode(),
            cacheKey:
              key.length > CACHE_KEY_TRUNCATE_LENGTH
                ? key.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
                : key,
            error: error instanceof Error ? error.message : String(error),
            reason,
          });
        });
      },
    });

    logger.debug(`${this.getAuthMode()} client manager initialized`, {
      clientCacheMaxSize: this.config.clientCache.maxSize,
      clientCacheTTL: this.config.clientCache.slidingTtl,
      credentialCacheMaxSize: this.config.credentialCache.maxSize,
      credentialCacheTTL: this.config.credentialCache.slidingTtl,
      credentialAbsoluteTTL: this.config.credentialCache.absoluteTTL,
      authMode: this.getAuthMode(),
    });
  }

  private async disposeClientEntry(
    entry: ClientCacheEntry<TClient>,
    cacheKey: string,
    reason: string,
  ): Promise<void> {
    if (!hasDispose(entry.client)) {
      return;
    }

    try {
      logger.debug("Disposing client", {
        authMode: this.getAuthMode(),
        cacheKey:
          cacheKey.length > CACHE_KEY_TRUNCATE_LENGTH
            ? cacheKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
            : cacheKey,
        reason,
        clientType: entry.client?.constructor?.name || "Unknown",
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = entry.client as any;

      if (client[Symbol.asyncDispose]) {
        await client[Symbol.asyncDispose]();
      } else if (client[Symbol.dispose]) {
        client[Symbol.dispose]();
      } else if (client.dispose) {
        await client.dispose();
      }

      logger.debug("Client disposed successfully", {
        authMode: this.getAuthMode(),
        cacheKey:
          cacheKey.length > CACHE_KEY_TRUNCATE_LENGTH
            ? cacheKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
            : cacheKey,
        reason,
      });
    } catch (error) {
      logger.warn("Client dispose failed, continuing cleanup", {
        authMode: this.getAuthMode(),
        cacheKey:
          cacheKey.length > CACHE_KEY_TRUNCATE_LENGTH
            ? cacheKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
            : cacheKey,
        error: error instanceof Error ? error.message : String(error),
        reason,
      });
    }
  }

  protected createCredentialCacheKey(context: TContext): string {
    const parts = [
      this.config.cacheKeyPrefix,
      this.getAuthMode(),
      ...this.getCredentialCacheKeyComponents(context),
    ];
    return parts.join("::");
  }

  protected async getOrCreateCredential(
    context: TContext,
  ): Promise<TokenCredential> {
    const credKey = this.createCredentialCacheKey(context);

    const cached = this.credentialCache.get(credKey);
    if (cached && cached.absoluteExpiresAt > Date.now()) {
      logger.debug("Credential cache hit", {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
        cacheKey:
          credKey.length > CACHE_KEY_TRUNCATE_LENGTH
            ? credKey.substring(0, CACHE_KEY_TRUNCATE_LENGTH) + "..."
            : credKey,
      });
      return cached.credential;
    }

    const existingPromise = this.pendingCredentials.get(credKey);
    if (existingPromise) {
      logger.debug("Found pending credential request", {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
      });
      return existingPromise;
    }

    logger.debug("Credential cache miss, creating new credential", {
      authMode: this.getAuthMode(),
      ...this.getLoggingContext(context),
    });

    const promise = this.createCredentialInternal(context, credKey);
    this.pendingCredentials.set(credKey, promise);

    try {
      return await promise;
    } finally {
      this.pendingCredentials.delete(credKey);
    }
  }

  private async createCredentialInternal(
    context: TContext,
    credKey: string,
  ): Promise<TokenCredential> {
    const credential = await this.provider.createCredential(context);

    const entry: CredentialCacheEntry = {
      credential,
      absoluteExpiresAt: Date.now() + this.config.credentialCache.absoluteTTL,
    };

    this.credentialCache.set(credKey, entry);

    logger.debug("Credential created and cached", {
      authMode: this.getAuthMode(),
      ...this.getLoggingContext(context),
      slidingTTL: this.config.credentialCache.slidingTtl,
      expiresAt: new Date(entry.absoluteExpiresAt).toISOString(),
      credentialCacheSize: this.credentialCache.size,
    });

    return credential;
  }

  async getClient(context: TContext, options?: TOptions): Promise<TClient> {
    const rawKey = this.createClientCacheKey(context, options);
    const stableKey = createStableCacheKey(rawKey);

    logger.debug("Cache lookup", {
      authMode: this.getAuthMode(),
      ...this.getLoggingContext(context),
      cacheKey: createLoggableKey(rawKey),
    });

    const cached = this.clientCache.get(stableKey)?.client;
    if (cached) {
      logger.debug("Cache hit", {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
        cacheSize: this.clientCache.size,
      });
      return cached;
    }

    const existingPromise = this.pendingRequests.get(stableKey);
    if (existingPromise) {
      logger.debug("Found pending request", {
        authMode: this.getAuthMode(),
        ...this.getLoggingContext(context),
      });
      return existingPromise;
    }

    logger.debug("Cache miss, creating new client", {
      authMode: this.getAuthMode(),
      ...this.getLoggingContext(context),
    });

    const promise = this.createClientInternal(context, options, stableKey);
    this.pendingRequests.set(stableKey, promise);

    try {
      return await promise;
    } finally {
      this.pendingRequests.delete(stableKey);
    }
  }

  protected async createClientInternal(
    context: TContext,
    options: TOptions | undefined,
    cacheKey: string,
  ): Promise<TClient> {
    const credential = await this.getOrCreateCredential(context);
    const client = await this.clientFactory.createClient(credential, options);

    const entry: ClientCacheEntry<TClient> = {
      client,
    };

    this.clientCache.set(cacheKey, entry);

    logger.debug("Client created and cached", {
      authMode: this.getAuthMode(),
      ...this.getLoggingContext(context),
      slidingTTL: this.config.clientCache.slidingTtl,
      cacheSize: this.clientCache.size,
    });

    return client;
  }

  clearCache(): void {
    this.clientCache.clear();
    this.credentialCache.clear();
    logger.debug("All caches cleared", { authMode: this.getAuthMode() });
  }

  clearCredentialCache(): void {
    this.credentialCache.clear();
    logger.debug("Credential cache cleared", { authMode: this.getAuthMode() });
  }

  removeCachedClientByContext(context: TContext, options?: TOptions): boolean {
    const rawKey = this.createClientCacheKey(context, options);
    const stableKey = createStableCacheKey(rawKey);

    const deleted = this.clientCache.delete(stableKey);

    logger.debug("Cache entry removed by context", {
      authMode: this.getAuthMode(),
      ...this.getLoggingContext(context),
      cacheKey: createLoggableKey(rawKey),
      deleted,
      cacheSize: this.clientCache.size,
    });
    return deleted;
  }

  getCacheStats() {
    return {
      clientCache: {
        size: this.clientCache.size,
        maxSize: this.clientCache.max,
        pendingRequests: this.pendingRequests.size,
      },
      credentialCache: {
        size: this.credentialCache.size,
        maxSize: this.credentialCache.max,
        pendingRequests: this.pendingCredentials.size,
      },
    };
  }

  protected abstract getCredentialCacheKeyComponents(
    context: TContext,
  ): string[];
  protected abstract getAuthMode(): string;
  protected abstract createClientCacheKey(
    context: TContext,
    options?: TOptions,
  ): string;
  protected abstract getLoggingContext(
    context: TContext,
  ): Record<string, unknown>;
}
