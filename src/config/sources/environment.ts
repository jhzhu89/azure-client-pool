import { ConfigurationSource } from "../source.js";

export class EnvironmentSource implements ConfigurationSource {
  async load() {
    return {
      azure: {
        clientId: process.env.AZURE_CLIENT_ID,
        tenantId: process.env.AZURE_TENANT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
        certificatePath: process.env.AZURE_CLIENT_CERTIFICATE_PATH,
        certificatePem: process.env.AZURE_CLIENT_CERTIFICATE_PEM,
        managedIdentityClientId: process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID,
        applicationAuthStrategy: process.env.AZURE_APPLICATION_AUTH_STRATEGY,
      },
      jwt: {
        audience: process.env.JWT_AUDIENCE,
        issuer: process.env.JWT_ISSUER,
        clockTolerance: process.env.JWT_CLOCK_TOLERANCE,
        cacheMaxAge: process.env.JWT_CACHE_MAX_AGE,
        jwksRequestsPerMinute: process.env.JWKS_REQUESTS_PER_MINUTE,
      },
      cache: {
        keyPrefix: process.env.CACHE_KEY_PREFIX,
        clientCacheSlidingTtl: process.env.CACHE_CLIENT_SLIDING_TTL,
        clientCacheMaxSize: process.env.CACHE_CLIENT_MAX_SIZE,
        clientCacheBufferMs: process.env.CACHE_CLIENT_BUFFER_MS,
        credentialCacheSlidingTtl: process.env.CACHE_CREDENTIAL_SLIDING_TTL,
        credentialCacheMaxSize: process.env.CACHE_CREDENTIAL_MAX_SIZE,
        credentialCacheAbsoluteTtl: process.env.CACHE_CREDENTIAL_ABSOLUTE_TTL,
      },
    };
  }
}
