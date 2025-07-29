import { z } from "zod";
import { ApplicationAuthStrategy } from "../types.js";

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;

export const DEFAULT_CONFIG = {
  azure: {},
  jwt: {
    clockTolerance: 300,
    cacheMaxAge: 24 * HOURS,
    jwksRequestsPerMinute: 10,
  },
  cache: {
    keyPrefix: "client",
    clientCacheSlidingTtl: 45 * MINUTES,
    clientCacheMaxSize: 100,
    clientCacheBufferMs: 15 * SECONDS,
    credentialCacheSlidingTtl: 2 * HOURS,
    credentialCacheMaxSize: 200,
    credentialCacheAbsoluteTtl: 12 * HOURS,
  },
} as const;

const azureSchema = z
  .object({
    clientId: z.string().optional(),
    tenantId: z.string().optional(),
    clientSecret: z.string().optional(),
    certificatePath: z.string().optional(),
    certificatePem: z.string().optional(),
    managedIdentityClientId: z.string().optional(),
    applicationAuthStrategy: z.enum(["cli", "mi", "chain"]).optional(),
  })
  .default(DEFAULT_CONFIG.azure);

const jwtSchema = z
  .object({
    audience: z.string().optional(),
    issuer: z.array(z.string()).optional(),
    clockTolerance: z.coerce
      .number()
      .default(DEFAULT_CONFIG.jwt.clockTolerance),
    cacheMaxAge: z.coerce.number().default(DEFAULT_CONFIG.jwt.cacheMaxAge),
    jwksRequestsPerMinute: z.coerce
      .number()
      .default(DEFAULT_CONFIG.jwt.jwksRequestsPerMinute),
  })
  .default(DEFAULT_CONFIG.jwt);

const cacheSchema = z
  .object({
    keyPrefix: z.string().default(DEFAULT_CONFIG.cache.keyPrefix),
    clientCacheSlidingTtl: z.coerce
      .number()
      .default(DEFAULT_CONFIG.cache.clientCacheSlidingTtl),
    clientCacheMaxSize: z.coerce
      .number()
      .default(DEFAULT_CONFIG.cache.clientCacheMaxSize),
    clientCacheBufferMs: z.coerce
      .number()
      .default(DEFAULT_CONFIG.cache.clientCacheBufferMs),
    credentialCacheSlidingTtl: z.coerce
      .number()
      .default(DEFAULT_CONFIG.cache.credentialCacheSlidingTtl),
    credentialCacheMaxSize: z.coerce
      .number()
      .default(DEFAULT_CONFIG.cache.credentialCacheMaxSize),
    credentialCacheAbsoluteTtl: z.coerce
      .number()
      .default(DEFAULT_CONFIG.cache.credentialCacheAbsoluteTtl),
  })
  .default(DEFAULT_CONFIG.cache);

export const configSchema = z
  .object({
    azure: azureSchema,
    jwt: jwtSchema,
    cache: cacheSchema,
  })
  .transform((config) => {
    if (
      config.azure.tenantId &&
      (!config.jwt.issuer || config.jwt.issuer.length === 0)
    ) {
      return {
        ...config,
        jwt: {
          ...config.jwt,
          issuer: [
            `https://sts.windows.net/${config.azure.tenantId}/`,
            `https://login.microsoftonline.com/${config.azure.tenantId}/v2.0`,
          ],
        },
      };
    }

    return config;
  });

export type ClientPoolConfiguration = z.infer<typeof configSchema>;

export interface JwtConfig {
  clientId: string;
  tenantId: string;
  audience?: string;
  issuer?: string[];
  clockTolerance: number;
  cacheMaxAge: number;
  jwksRequestsPerMinute: number;
}

export interface ClientCacheConfig {
  slidingTtl: number;
  maxSize: number;
  bufferMs: number;
}

export interface CredentialCacheConfig {
  slidingTtl: number;
  maxSize: number;
  absoluteTtl: number;
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
  certificatePem?: string;
}
