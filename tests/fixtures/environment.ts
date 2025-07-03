export const applicationModeEnv = {
  AZURE_AUTH_MODE: "application",
  NODE_ENV: "test",
};

export const delegatedModeWithSecretEnv = {
  AZURE_AUTH_MODE: "delegated",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  NODE_ENV: "test",
};

export const delegatedModeWithCertEnv = {
  AZURE_AUTH_MODE: "delegated",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_CERTIFICATE_PATH: "/path/to/cert.pem",
  AZURE_CLIENT_CERTIFICATE_PASSWORD: "cert-password",
  NODE_ENV: "test",
};

export const delegatedModeInvalidEnv = {
  AZURE_AUTH_MODE: "delegated",
  AZURE_CLIENT_ID: "test-client-id",
  NODE_ENV: "test",
};

export const delegatedModeConflictEnv = {
  AZURE_AUTH_MODE: "delegated",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_CLIENT_CERTIFICATE_PATH: "/path/to/cert.pem",
  NODE_ENV: "test",
};

export const customCacheEnv = {
  AZURE_AUTH_MODE: "application",
  CACHE_KEY_PREFIX: "custom",
  CACHE_CLIENT_SLIDING_TTL: "3600000",
  CACHE_CLIENT_MAX_SIZE: "25",
  CACHE_CREDENTIAL_SLIDING_TTL: "1800000",
  CACHE_CREDENTIAL_MAX_SIZE: "5",
  CACHE_CREDENTIAL_ABSOLUTE_TTL: "7200000",
  NODE_ENV: "test",
};

export const jwtConfigEnv = {
  AZURE_AUTH_MODE: "delegated",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  JWT_AUDIENCE: "test-audience",
  JWT_ISSUER: "test-issuer",
  JWT_CLOCK_TOLERANCE: "600",
  JWT_CACHE_MAX_AGE: "172800000",
  JWKS_REQUESTS_PER_MINUTE: "20",
  NODE_ENV: "test",
};
