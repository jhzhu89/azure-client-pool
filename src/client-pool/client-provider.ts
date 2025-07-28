import { type ClientFactory, AuthMode, CredentialType } from "../types.js";
import { type ClientManagerConfig } from "../config/configuration.js";
import { type AuthRequest } from "../types.js";
import { CredentialManager } from "../credentials/manager.js";
import { CacheManager, createStableCacheKey } from "../utils/cache.js";
import { getLogger } from "../utils/logging.js";
import { JwtHandler } from "../auth/jwt/validator.js";
import { AuthContextFactory, type AuthContext } from "../auth/context.js";

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
    private jwtHandler?: JwtHandler,
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
    const authContext = await this.createAuthContext(authRequest);
    this.validateAuthContext(authContext);

    const rawCacheKey = this.generateRawCacheKey(authContext, options);
    const cacheKey = createStableCacheKey(rawCacheKey);

    logger.debug("Getting client from cache", {
      rawCacheKey,
    });

    let customTtl: number | undefined;
    if (authContext.mode !== AuthMode.Application) {
      const now = Date.now();

      if (authContext.expiresAt <= now) {
        throw new Error("Token has already expired");
      }

      const tokenRemainingTime = authContext.expiresAt - now;
      const bufferMs = this.config.clientCache.bufferMs;

      customTtl = Math.max(tokenRemainingTime - bufferMs, 1);

      logger.debug("Using dynamic TTL for token-based auth", {
        tokenExpiresAt: new Date(authContext.expiresAt).toISOString(),
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
            authContext.mode !== AuthMode.Application
              ? authContext.userObjectId
              : undefined,
          tenantId:
            authContext.mode !== AuthMode.Application
              ? authContext.tenantId
              : undefined,
        });

        const credentialProvider = {
          getCredential: (authType: CredentialType) =>
            this.credentialManager.getCredential(authContext, authType),
        };
        return this.clientFactory.createClient(credentialProvider, options);
      },
      customTtl,
      {
        authMode: authContext.mode,
        userObjectId:
          authContext.mode !== AuthMode.Application
            ? authContext.userObjectId
            : undefined,
        tenantId:
          authContext.mode !== AuthMode.Application
            ? authContext.tenantId
            : undefined,
      },
    );
  }

  async invalidateClientCache(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<boolean> {
    const authContext = await this.createAuthContext(authRequest);
    this.validateAuthContext(authContext);

    const rawCacheKey = this.generateRawCacheKey(authContext, options);
    const cacheKey = createStableCacheKey(rawCacheKey);
    const removed = this.clientCache.delete(cacheKey);

    logger.debug("Removed specific client from cache", {
      rawCacheKey,
      removed,
    });

    return removed;
  }

  private async createAuthContext(
    authRequest: AuthRequest,
  ): Promise<AuthContext> {
    if (authRequest.mode === AuthMode.Application) {
      return AuthContextFactory.application();
    }

    if (!this.jwtHandler) {
      throw new Error("JWT handler is required for token-based authentication");
    }

    const parsedToken = await this.jwtHandler.validateToken(
      authRequest.userAssertionToken,
    );

    if (authRequest.mode === AuthMode.Delegated) {
      return AuthContextFactory.delegated(parsedToken);
    } else {
      return AuthContextFactory.composite(parsedToken);
    }
  }

  private validateAuthContext(authContext: AuthContext): void {
    if (authContext.mode !== AuthMode.Application) {
      if (!authContext.tenantId) {
        throw new Error(
          "tenantId is required for delegated/composite authentication",
        );
      }
      if (!authContext.userObjectId) {
        throw new Error(
          "userObjectId is required for delegated/composite authentication",
        );
      }
    }
  }

  private generateRawCacheKey(
    authContext: AuthContext,
    options?: TOptions,
  ): string {
    const parts: string[] = [this.config.cacheKeyPrefix, authContext.mode];

    if (authContext.mode !== AuthMode.Application) {
      parts.push(
        `tenant:${authContext.tenantId}`,
        `user:${authContext.userObjectId}`,
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
