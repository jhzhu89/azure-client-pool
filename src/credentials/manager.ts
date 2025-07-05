import { type TokenCredential } from "@azure/identity";
import {
  type ClientManagerConfig,
  type DelegatedAuthConfig,
  type ApplicationAuthConfig,
} from "../config/configuration.js";
import {
  type AuthContext,
  type TokenBasedAuthContext,
} from "../auth/context.js";
import { CredentialType, AuthMode } from "../types.js";
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
  delegatedCredentials: {
    size: number;
    maxSize: number;
    pendingRequests: number;
  };
}

export class CredentialManager {
  private readonly applicationCredentialCache: CredentialCache;
  private readonly delegatedCredentialCache: CredentialCache;
  private readonly credentialFactory: CredentialFactory;

  constructor(
    applicationConfig: ApplicationAuthConfig,
    delegatedConfig: DelegatedAuthConfig,
    private readonly config: ClientManagerConfig,
  ) {
    this.credentialFactory = new CredentialFactory(
      applicationConfig,
      delegatedConfig,
    );
    this.applicationCredentialCache = this.createCredentialCache(
      "application-credential",
    );
    this.delegatedCredentialCache = this.createCredentialCache(
      "delegated-credential",
    );
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
    authType: CredentialType,
  ): Promise<TokenCredential> {
    switch (authType) {
      case CredentialType.Application:
        return this.getApplicationCredential();
      case CredentialType.Delegated:
        return this.getDelegatedCredential(authContext);
      default:
        throw new Error(`Unsupported auth type: ${authType}`);
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
      { authType: CredentialType.Application },
    );
  }

  async getDelegatedCredential(
    authContext: AuthContext,
  ): Promise<TokenCredential> {
    const tokenContext = this.validateAndGetTokenContext(authContext);

    const rawCacheKey = this.createDelegatedRawCacheKey(tokenContext);
    const cacheKey = createStableCacheKey(rawCacheKey);

    logger.debug("Getting delegated credential from cache", {
      rawCacheKey,
    });

    return this.delegatedCredentialCache.getOrCreate(
      cacheKey,
      async () =>
        this.credentialFactory.createDelegatedCredential(tokenContext),
      {
        authType: CredentialType.Delegated,
        userObjectId: tokenContext.userObjectId,
        tenantId: tokenContext.tenantId,
      },
    );
  }

  private validateAndGetTokenContext(
    authContext: AuthContext,
  ): TokenBasedAuthContext {
    if (authContext.mode === AuthMode.Application) {
      throw new Error(
        "Cannot provide delegated credentials with ApplicationAuthContext",
      );
    }
    return authContext as TokenBasedAuthContext;
  }

  private createApplicationRawCacheKey(): string {
    const parts = [this.config.cacheKeyPrefix, CredentialType.Application];
    return parts.join("::");
  }

  private createDelegatedRawCacheKey(
    authContext: TokenBasedAuthContext,
  ): string {
    const parts = [
      this.config.cacheKeyPrefix,
      CredentialType.Delegated,
      authContext.tenantId,
      authContext.userObjectId,
    ];
    return parts.join("::");
  }

  clearCache(): void {
    this.applicationCredentialCache.clear();
    this.delegatedCredentialCache.clear();
    logger.debug("All credential caches cleared");
  }

  getCacheStats(): CacheStats {
    return {
      applicationCredentials: this.applicationCredentialCache.getStats(),
      delegatedCredentials: this.delegatedCredentialCache.getStats(),
    };
  }
}
