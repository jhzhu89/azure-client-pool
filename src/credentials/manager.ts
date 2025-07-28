import { type TokenCredential } from "@azure/identity";
import {
  type ClientManagerConfig,
  type DelegatedAuthConfig,
  type ApplicationAuthConfig,
} from "../config/configuration.js";
import { CredentialType, AuthMode } from "../types.js";
import { type AuthContext } from "../auth/context.js";
import { CacheManager, createStableCacheKey } from "../utils/cache.js";
import { getLogger } from "../utils/logging.js";
import { CredentialFactory } from "./credential-factory.js";

const logger = getLogger("credential-manager");

type CredentialCache = CacheManager<TokenCredential>;

interface CacheStats {
  applicationCredentials: {
    size: number;
    maxSize: number;
    pendingRequests: number;
  };
}

export class CredentialManager {
  private readonly applicationCredentialCache: CredentialCache;
  private readonly credentialFactory: CredentialFactory;

  private constructor(
    credentialFactory: CredentialFactory,
    private readonly config: ClientManagerConfig,
  ) {
    this.credentialFactory = credentialFactory;
    this.applicationCredentialCache = this.createCredentialCache(
      "application-credential",
    );
  }

  static async create(
    applicationConfig: ApplicationAuthConfig,
    config: ClientManagerConfig,
    delegatedConfig?: DelegatedAuthConfig,
  ): Promise<CredentialManager> {
    const credentialFactory = await CredentialFactory.create(
      applicationConfig,
      delegatedConfig,
    );
    return new CredentialManager(credentialFactory, config);
  }

  private createCredentialCache(cacheType: string): CredentialCache {
    return new CacheManager<TokenCredential>(
      {
        maxSize: this.config.credentialCache.maxSize,
        slidingTtl: this.config.credentialCache.slidingTtl,
        absoluteTtl: this.config.credentialCache.absoluteTtl,
      },
      cacheType,
    );
  }

  async getCredential(
    authContext: AuthContext,
    credentialType: CredentialType,
  ): Promise<TokenCredential> {
    switch (credentialType) {
      case CredentialType.Application:
        return this.getApplicationCredential();
      case CredentialType.Delegated:
        return this.getDelegatedCredential(authContext);
      default:
        throw new Error(`Unsupported auth type: ${credentialType}`);
    }
  }

  async getApplicationCredential(): Promise<TokenCredential> {
    const rawCacheKey = this.createApplicationRawCacheKey();
    const cacheKey = createStableCacheKey(rawCacheKey);

    logger.debug("Getting application credential from cache", {
      rawCacheKey,
    });

    return this.applicationCredentialCache.getOrCreate(
      cacheKey,
      async () => this.credentialFactory.createApplicationCredential(),
      undefined,
      { authType: CredentialType.Application },
    );
  }

  async getDelegatedCredential(
    authContext: AuthContext,
  ): Promise<TokenCredential> {
    if (authContext.mode === AuthMode.Application) {
      throw new Error(
        "Cannot provide delegated credentials with Application auth context",
      );
    }

    const now = Date.now();
    if (authContext.expiresAt <= now) {
      const expiredAt = new Date(authContext.expiresAt).toISOString();

      logger.error("User assertion token has expired", {
        tenantId: authContext.tenantId,
        userObjectId: authContext.userObjectId,
        expiredAt,
      });

      throw new Error(
        `User assertion token expired at ${expiredAt}. Please refresh the token and try again.`,
      );
    }

    logger.debug("Creating delegated credential without caching", {
      tenantId: authContext.tenantId,
      userObjectId: authContext.userObjectId,
      tokenExpiresAt: new Date(authContext.expiresAt).toISOString(),
    });

    return this.credentialFactory.createDelegatedCredential(authContext);
  }

  private createApplicationRawCacheKey(): string {
    const parts = [this.config.cacheKeyPrefix, CredentialType.Application];
    return parts.join("::");
  }

  clearCache(): void {
    this.applicationCredentialCache.clear();
    logger.debug("Application credential cache cleared");
  }

  getCacheStats(): CacheStats {
    return {
      applicationCredentials: this.applicationCredentialCache.getStats(),
    };
  }
}
