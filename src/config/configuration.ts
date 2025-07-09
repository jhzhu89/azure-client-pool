import { getLogger } from "../utils/logging.js";
import { ApplicationAuthStrategy } from "../types.js";

const logger = getLogger("configuration");

export interface JwtConfig {
  clientId: string;
  tenantId: string;
  audience?: string;
  issuer?: string;
  clockTolerance: number;
  cacheMaxAge: number;
  jwksRequestsPerMinute: number;
}

export interface ClientCacheConfig {
  slidingTtl: number;
  maxSize: number;
}

export interface CredentialCacheConfig {
  slidingTtl: number;
  maxSize: number;
  absoluteTtl: number;
  bufferMs: number;
}

export interface ClientManagerConfig {
  cacheKeyPrefix: string;
  clientCache: ClientCacheConfig;
  credentialCache: CredentialCacheConfig;
}

export interface ApplicationAuthConfig {
  managedIdentityClientId?: string;
  strategy: ApplicationAuthStrategy;
}

export interface DelegatedAuthConfig {
  clientId: string;
  tenantId: string;
  clientSecret?: string;
  certificatePath?: string;
  certificatePassword?: string;
}

interface RawEnvironmentConfig {
  azure: {
    clientId: string;
    clientSecret?: string;
    certificatePath?: string;
    certificatePassword?: string;
    tenantId: string;
    managedIdentityClientId?: string;
    applicationAuthStrategy?: string;
  };
  jwt: {
    audience?: string;
    issuer?: string;
    clockTolerance: number;
    cacheMaxAge: number;
    jwksRequestsPerMinute: number;
  };
  cache: {
    keyPrefix: string;
    clientCacheSlidingTtl?: number;
    clientCacheMaxSize?: number;
    credentialCacheSlidingTtl?: number;
    credentialCacheMaxSize?: number;
    credentialCacheAbsoluteTtl?: number;
    credentialCacheBufferMs?: number;
  };
}

function loadRawEnvironmentConfig(): RawEnvironmentConfig {
  logger.debug("Loading environment configuration");

  const nodeEnv = process.env.NODE_ENV || "development";

  logger.debug("Configuration loaded", {
    nodeEnv,
    tenantId: process.env.AZURE_TENANT_ID,
  });

  return {
    azure: {
      clientId: process.env.AZURE_CLIENT_ID || "",
      ...(process.env.AZURE_CLIENT_SECRET && {
        clientSecret: process.env.AZURE_CLIENT_SECRET,
      }),
      ...(process.env.AZURE_CLIENT_CERTIFICATE_PATH && {
        certificatePath: process.env.AZURE_CLIENT_CERTIFICATE_PATH,
      }),
      ...(process.env.AZURE_CLIENT_CERTIFICATE_PASSWORD && {
        certificatePassword: process.env.AZURE_CLIENT_CERTIFICATE_PASSWORD,
      }),
      tenantId: process.env.AZURE_TENANT_ID || "",
      ...(process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID && {
        managedIdentityClientId: process.env.AZURE_MANAGED_IDENTITY_CLIENT_ID,
      }),
      ...(process.env.AZURE_APPLICATION_AUTH_STRATEGY && {
        applicationAuthStrategy: process.env.AZURE_APPLICATION_AUTH_STRATEGY,
      }),
    },
    jwt: {
      ...(process.env.JWT_AUDIENCE && { audience: process.env.JWT_AUDIENCE }),
      ...(process.env.JWT_ISSUER && { issuer: process.env.JWT_ISSUER }),
      clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE || "300"),
      cacheMaxAge: parseInt(process.env.JWT_CACHE_MAX_AGE || "86400000"),
      jwksRequestsPerMinute: parseInt(
        process.env.JWKS_REQUESTS_PER_MINUTE || "10",
      ),
    },
    cache: {
      keyPrefix: process.env.CACHE_KEY_PREFIX || "client",
      ...(process.env.CACHE_CLIENT_SLIDING_TTL && {
        clientCacheSlidingTtl: parseInt(process.env.CACHE_CLIENT_SLIDING_TTL),
      }),
      ...(process.env.CACHE_CLIENT_MAX_SIZE && {
        clientCacheMaxSize: parseInt(process.env.CACHE_CLIENT_MAX_SIZE),
      }),
      ...(process.env.CACHE_CREDENTIAL_SLIDING_TTL && {
        credentialCacheSlidingTtl: parseInt(
          process.env.CACHE_CREDENTIAL_SLIDING_TTL,
        ),
      }),
      ...(process.env.CACHE_CREDENTIAL_MAX_SIZE && {
        credentialCacheMaxSize: parseInt(process.env.CACHE_CREDENTIAL_MAX_SIZE),
      }),
      ...(process.env.CACHE_CREDENTIAL_ABSOLUTE_TTL && {
        credentialCacheAbsoluteTtl: parseInt(
          process.env.CACHE_CREDENTIAL_ABSOLUTE_TTL,
        ),
      }),
      ...(process.env.CACHE_CREDENTIAL_BUFFER_MS && {
        credentialCacheBufferMs: parseInt(
          process.env.CACHE_CREDENTIAL_BUFFER_MS,
        ),
      }),
    },
  };
}

function validateRawEnvironmentConfig(config: RawEnvironmentConfig): void {
  if (
    config.jwt.clockTolerance < 0 ||
    config.jwt.cacheMaxAge <= 0 ||
    config.jwt.jwksRequestsPerMinute <= 0
  ) {
    throw new Error("JWT configuration must have valid values");
  }
}

function createApplicationAuthConfig(
  raw: RawEnvironmentConfig,
): ApplicationAuthConfig {
  const strategyString =
    raw.azure.applicationAuthStrategy || ApplicationAuthStrategy.Chain;

  const strategy = Object.values(ApplicationAuthStrategy).includes(
    strategyString as ApplicationAuthStrategy,
  )
    ? (strategyString as ApplicationAuthStrategy)
    : ApplicationAuthStrategy.Chain;

  return {
    ...(raw.azure.managedIdentityClientId && {
      managedIdentityClientId: raw.azure.managedIdentityClientId,
    }),
    strategy,
  };
}

function createDelegatedAuthConfig(
  raw: RawEnvironmentConfig,
): DelegatedAuthConfig {
  const {
    clientId,
    tenantId,
    clientSecret,
    certificatePath,
    certificatePassword,
  } = raw.azure;

  if (!clientId || !tenantId) {
    throw new Error(
      "AZURE_CLIENT_ID and AZURE_TENANT_ID must be set for delegated authentication",
    );
  }

  const hasSecret = !!clientSecret;
  const hasCertificate = !!certificatePath;

  if (!hasSecret && !hasCertificate) {
    throw new Error(
      "Either AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH must be set for delegated authentication",
    );
  }

  if (hasSecret && hasCertificate) {
    throw new Error(
      "Only one of AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH should be set",
    );
  }

  return {
    clientId,
    tenantId,
    ...(clientSecret && { clientSecret }),
    ...(certificatePath && { certificatePath }),
    ...(certificatePassword && { certificatePassword }),
  };
}

function createJwtConfig(raw: RawEnvironmentConfig): JwtConfig {
  const { clientId, tenantId } = raw.azure;

  if (!clientId || !tenantId) {
    throw new Error(
      "AZURE_CLIENT_ID and AZURE_TENANT_ID must be set for JWT validation",
    );
  }

  return {
    clientId,
    tenantId,
    ...raw.jwt,
  };
}

function createClientManagerConfig(
  raw: RawEnvironmentConfig,
): ClientManagerConfig {
  return {
    cacheKeyPrefix: raw.cache.keyPrefix,
    clientCache: {
      slidingTtl: raw.cache.clientCacheSlidingTtl ?? 45 * 60 * 1000,
      maxSize: raw.cache.clientCacheMaxSize ?? 100,
    },
    credentialCache: {
      slidingTtl: raw.cache.credentialCacheSlidingTtl ?? 2 * 60 * 60 * 1000,
      maxSize: raw.cache.credentialCacheMaxSize ?? 200,
      absoluteTtl: raw.cache.credentialCacheAbsoluteTtl ?? 8 * 60 * 60 * 1000,
      bufferMs: raw.cache.credentialCacheBufferMs ?? 30 * 1000,
    },
  };
}

let cachedRawConfig: RawEnvironmentConfig | null = null;

function getRawConfig(): RawEnvironmentConfig {
  if (!cachedRawConfig) {
    cachedRawConfig = loadRawEnvironmentConfig();
    validateRawEnvironmentConfig(cachedRawConfig);
  }
  return cachedRawConfig;
}

export function resetConfigCache(): void {
  cachedRawConfig = null;
}

export function getApplicationAuthConfig(): ApplicationAuthConfig {
  return createApplicationAuthConfig(getRawConfig());
}

export function getDelegatedAuthConfig(): DelegatedAuthConfig {
  return createDelegatedAuthConfig(getRawConfig());
}

export function getJwtConfig(): JwtConfig {
  return createJwtConfig(getRawConfig());
}

export function getClientManagerConfig(): ClientManagerConfig {
  return createClientManagerConfig(getRawConfig());
}
