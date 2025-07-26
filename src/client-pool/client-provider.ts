import { type ClientFactory, AuthMode, CredentialType } from "../types.js";
import { type ClientManagerConfig } from "../config/configuration.js";
import { type AuthRequest } from "../types.js";
import { CredentialManager } from "../credentials/manager.js";
import { CacheManager, createStableCacheKey } from "../utils/cache.js";
import { getLogger } from "../utils/logging.js";

const logger = getLogger("client-provider");

export interface ClientProvider<TClient, TOptions = void> {
  getClient(authRequest: AuthRequest, options?: TOptions): Promise<TClient>;
  invalidateClientCache(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<boolean>;
}

export class ClientProviderImpl<TClient, TOptions = void>
  implements ClientProvider<TClient, TOptions>
{
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
      "client-provider",
    );
  }

  async getClient(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<TClient> {
    this.validateAuthRequest(authRequest);

    const rawCacheKey = this.generateRawCacheKey(authRequest, options);
    const cacheKey = createStableCacheKey(rawCacheKey);

    logger.debug("Getting client from cache", {
      rawCacheKey,
    });

    let customTtl: number | undefined;
    if (authRequest.mode !== AuthMode.Application) {
      const now = Date.now();

      if (authRequest.identity.expiresAt <= now) {
        throw new Error("Token has already expired");
      }

      const tokenRemainingTime = authRequest.identity.expiresAt - now;
      const bufferMs = this.config.clientCache.bufferMs;

      customTtl = Math.max(tokenRemainingTime - bufferMs, 0);

      logger.debug("Using dynamic TTL for token-based auth", {
        tokenExpiresAt: new Date(authRequest.identity.expiresAt).toISOString(),
        tokenRemainingTime: Math.floor(tokenRemainingTime / 1000),
        bufferMs: Math.floor(bufferMs / 1000),
        customTtl: Math.floor(customTtl / 1000),
      });
    }

    return this.clientCache.getOrCreate(
      cacheKey,
      async () => {
        logger.debug("Creating new client", {
          authMode: authRequest.mode,
          userObjectId:
            authRequest.mode !== AuthMode.Application
              ? authRequest.identity.userObjectId
              : undefined,
          tenantId:
            authRequest.mode !== AuthMode.Application
              ? authRequest.identity.tenantId
              : undefined,
        });

        const credentialProvider = {
          getCredential: (authType: CredentialType) =>
            this.credentialManager.getCredential(authRequest, authType),
        };
        return this.clientFactory.createClient(credentialProvider, options);
      },
      customTtl,
      {
        authMode: authRequest.mode,
        userObjectId:
          authRequest.mode !== AuthMode.Application
            ? authRequest.identity.userObjectId
            : undefined,
        tenantId:
          authRequest.mode !== AuthMode.Application
            ? authRequest.identity.tenantId
            : undefined,
      },
    );
  }

  async invalidateClientCache(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<boolean> {
    this.validateAuthRequest(authRequest);

    const rawCacheKey = this.generateRawCacheKey(authRequest, options);
    const cacheKey = createStableCacheKey(rawCacheKey);
    const removed = this.clientCache.delete(cacheKey);

    logger.debug("Removed specific client from cache", {
      rawCacheKey,
      removed,
    });

    return removed;
  }

  private validateAuthRequest(authRequest: AuthRequest): void {
    if (authRequest.mode !== AuthMode.Application) {
      if (!authRequest.identity.tenantId) {
        throw new Error(
          "tenantId is required for delegated/composite authentication",
        );
      }
      if (!authRequest.identity.userObjectId) {
        throw new Error(
          "userObjectId is required for delegated/composite authentication",
        );
      }
    }
  }

  private generateRawCacheKey(
    authRequest: AuthRequest,
    options?: TOptions,
  ): string {
    const parts: string[] = [this.config.cacheKeyPrefix, authRequest.mode];

    if (authRequest.mode !== AuthMode.Application) {
      parts.push(
        `tenant:${authRequest.identity.tenantId}`,
        `user:${authRequest.identity.userObjectId}`,
      );
    }

    if (options !== undefined) {
      const clientFingerprint =
        this.clientFactory.getClientFingerprint?.(options);
      if (clientFingerprint) {
        parts.push(`fingerprint:${clientFingerprint}`);
      } else {
        const optionsKey = this.serializeOptions(options);
        parts.push(`options:${optionsKey}`);
      }
    }

    return parts.join("::");
  }

  private serializeOptions(options: TOptions): string {
    const sorted = JSON.stringify(
      options,
      Object.keys(options as object).sort(),
    );
    return createStableCacheKey(sorted);
  }
}
