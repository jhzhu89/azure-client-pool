import { type ClientFactory, AuthMode, CredentialType } from "../types.js";
import { type ClientManagerConfig } from "../config/configuration.js";
import {
  type AuthContext,
  type TokenBasedAuthContext,
} from "../auth/context.js";
import { CredentialManager } from "../credentials/manager.js";
import { CacheManager, createStableCacheKey } from "../utils/cache.js";
import { getLogger } from "../utils/logging.js";

const logger = getLogger("client-pool");

export class ClientPool<TClient, TOptions = void> {
  private clientCache: CacheManager<TClient>;

  constructor(
    private clientFactory: ClientFactory<TClient, TOptions>,
    private credentialManager: CredentialManager,
    private config: ClientManagerConfig,
  ) {
    this.clientCache = new CacheManager<TClient>(
      {
        maxSize: config.clientCache.maxSize,
        slidingTtl: config.clientCache.slidingTtl,
      },
      "client-pool",
    );
  }

  async getClient(
    authContext: AuthContext,
    options?: TOptions,
  ): Promise<TClient> {
    const rawCacheKey = this.generateRawCacheKey(authContext, options);
    const cacheKey = createStableCacheKey(rawCacheKey);

    logger.debug("Getting client from cache", {
      rawCacheKey,
    });

    // Calculate dynamic TTL for token-based authentication
    let customTtl: number | undefined;
    if (authContext.mode !== AuthMode.Application) {
      const tokenContext = authContext as TokenBasedAuthContext;
      const now = Date.now();
      const tokenRemainingTime = tokenContext.expiresAt - now;
      const bufferMs = this.config.clientCache.bufferMs;

      customTtl = Math.max(tokenRemainingTime - bufferMs, 0);

      logger.debug("Using dynamic TTL for token-based auth", {
        tokenExpiresAt: new Date(tokenContext.expiresAt).toISOString(),
        tokenRemainingTime: Math.floor(tokenRemainingTime / 1000),
        bufferMs: Math.floor(bufferMs / 1000),
        customTtl: Math.floor(customTtl / 1000),
      });
    }

    return this.clientCache.getOrCreate(
      cacheKey,
      async () => {
        logger.debug("Creating new client", {
          authMode: authContext.mode,
          userObjectId:
            "userObjectId" in authContext
              ? authContext.userObjectId
              : undefined,
          tenantId:
            "tenantId" in authContext ? authContext.tenantId : undefined,
        });

        const credentialProvider = {
          getCredential: (authType: CredentialType) =>
            this.credentialManager.getCredential(authContext, authType),
        };
        return this.clientFactory.createClient(credentialProvider, options);
      },
      {
        authMode: authContext.mode,
        userObjectId:
          "userObjectId" in authContext ? authContext.userObjectId : undefined,
        tenantId: "tenantId" in authContext ? authContext.tenantId : undefined,
      },
      customTtl,
    );
  }

  private generateRawCacheKey(
    authContext: AuthContext,
    options?: TOptions,
  ): string {
    const parts: string[] = [this.config.cacheKeyPrefix, authContext.mode];

    if (authContext.mode !== AuthMode.Application) {
      const tokenContext = authContext as TokenBasedAuthContext;
      parts.push(
        tokenContext.tenantId || "unknown",
        tokenContext.userObjectId || "unknown",
      );
    }

    const clientFingerprint =
      this.clientFactory.getClientFingerprint?.(options);
    if (clientFingerprint) {
      parts.push(clientFingerprint);
    } else if (options !== undefined) {
      const optionsHash = createStableCacheKey(JSON.stringify(options));
      parts.push(optionsHash);
    }

    return parts.join("::");
  }

  async clearCache(): Promise<void> {
    this.clientCache.clear();
    logger.debug("Client pool cache cleared");
  }

  async removeCachedClient(
    authContext: AuthContext,
    options?: TOptions,
  ): Promise<boolean> {
    const rawCacheKey = this.generateRawCacheKey(authContext, options);
    const cacheKey = createStableCacheKey(rawCacheKey);
    const removed = this.clientCache.delete(cacheKey);

    logger.debug("Removed specific client from cache", {
      rawCacheKey,
      removed,
    });

    return removed;
  }

  getCacheStats() {
    return this.clientCache.getStats();
  }
}
