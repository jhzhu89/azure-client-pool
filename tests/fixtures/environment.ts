// Environment configurations for testing
// These match the actual configuration structure from src/config/configuration.ts
// Note: There is NO AZURE_AUTH_MODE - auth mode is determined by code logic

// Minimal application mode environment (CLI + ManagedIdentity chain strategy)
export const applicationModeEnv = {
  AZURE_APPLICATION_AUTH_STRATEGY: "chain", // Default: cli -> mi fallback
  NODE_ENV: "test",
};

// Application mode with managed identity client ID
export const applicationModeWithMIEnv = {
  AZURE_APPLICATION_AUTH_STRATEGY: "mi",
  AZURE_MANAGED_IDENTITY_CLIENT_ID: "test-mi-client-id",
  NODE_ENV: "test",
};

// Application mode CLI only
export const applicationModeCliEnv = {
  AZURE_APPLICATION_AUTH_STRATEGY: "cli",
  NODE_ENV: "test",
};

// Delegated mode with client secret (minimal required)
export const delegatedModeWithSecretEnv = {
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  NODE_ENV: "test",
};

// Delegated mode with certificate
export const delegatedModeWithCertEnv = {
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_CERTIFICATE_PATH: "/path/to/cert.pem",
  AZURE_CLIENT_CERTIFICATE_PASSWORD: "cert-password",
  NODE_ENV: "test",
};

// Error scenarios for delegated mode
export const delegatedModeInvalidEnv = {
  AZURE_CLIENT_ID: "test-client-id",
  // Missing AZURE_TENANT_ID to trigger validation error
  NODE_ENV: "test",
};
