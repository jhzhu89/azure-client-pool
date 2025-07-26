import { z } from "zod";
import { ApplicationAuthStrategy } from "../types.js";

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;

export const DEFAULT_CONFIG = {
  azure: {},
  cache: {
    keyPrefix: "client",
    clientCacheSlidingTtl: 45 * MINUTES,
    clientCacheMaxSize: 1000,
    clientCacheBufferMs: 1 * MINUTES,
    credentialCacheSlidingTtl: 2 * HOURS,
    credentialCacheMaxSize: 10,
    credentialCacheAbsoluteTtl: 8 * HOURS,
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

export const configSchema = z.object({
  azure: azureSchema,
  cache: cacheSchema,
});

export type ClientPoolConfiguration = z.infer<typeof configSchema>;

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
