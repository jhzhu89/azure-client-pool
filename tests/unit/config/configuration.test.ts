import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  loadAzureAuthConfig,
  validateAzureAuthConfig,
  getAzureAuthConfig,
  resetConfigCache,
  getDelegatedCredentialConfig,
  getApplicationClientManagerConfig,
} from "../../../src/config/configuration.js";
import {
  applicationModeEnv,
  delegatedModeWithSecretEnv,
  delegatedModeWithCertEnv,
  delegatedModeInvalidEnv,
  delegatedModeConflictEnv,
} from "../../fixtures/environment.js";

mock.module("../../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

describe("Configuration Module", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    resetConfigCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfigCache();
  });

  describe("loadAzureAuthConfig", () => {
    it("should load application mode configuration", () => {
      process.env = { ...applicationModeEnv };

      const config = loadAzureAuthConfig();

      expect(config.authMode).toBe("application");
      expect(config.cache.cacheKeyPrefix).toBe("client");
    });

    it("should load delegated mode configuration with client secret", () => {
      process.env = { ...delegatedModeWithSecretEnv };

      const config = loadAzureAuthConfig();

      expect(config.authMode).toBe("delegated");
      expect(config.azure.clientId).toBe("test-client-id");
      expect(config.azure.tenantId).toBe("test-tenant-id");
      expect(config.azure.clientSecret).toBe("test-client-secret");
    });

    it("should load delegated mode configuration with certificate", () => {
      process.env = { ...delegatedModeWithCertEnv };

      const config = loadAzureAuthConfig();

      expect(config.authMode).toBe("delegated");
      expect(config.azure.certificatePath).toBe("/path/to/cert.pem");
      expect(config.azure.clientSecret).toBeUndefined();
    });

    it("should throw error for invalid auth mode", () => {
      process.env = { AZURE_AUTH_MODE: "invalid" };

      expect(() => loadAzureAuthConfig()).toThrow(
        "AZURE_AUTH_MODE must be either 'application' or 'delegated', got: invalid",
      );
    });

    it("should throw error for delegated mode missing credentials", () => {
      process.env = { ...delegatedModeInvalidEnv };

      expect(() => loadAzureAuthConfig()).toThrow(
        "Required environment variable AZURE_TENANT_ID is not set",
      );
    });

    it("should throw error for conflicting credentials", () => {
      process.env = { ...delegatedModeConflictEnv };

      expect(() => loadAzureAuthConfig()).toThrow(
        "Only one of AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH should be set",
      );
    });
  });

  describe("validateAzureAuthConfig", () => {
    it("should validate application mode config", () => {
      const config = {
        authMode: "application" as const,
        azure: { clientId: "", tenantId: "" },
        cache: { cacheKeyPrefix: "client" },
        jwt: {
          clockTolerance: 300,
          cacheMaxAge: 86400000,
          jwksRequestsPerMinute: 10,
        },
      };

      expect(() => validateAzureAuthConfig(config)).not.toThrow();
    });

    it("should throw error for missing auth mode", () => {
      const config = {
        azure: { clientId: "", tenantId: "" },
        cache: { cacheKeyPrefix: "client" },
        jwt: {
          clockTolerance: 300,
          cacheMaxAge: 86400000,
          jwksRequestsPerMinute: 10,
        },
      };

      expect(() => validateAzureAuthConfig(config as any)).toThrow(
        "authMode must be either 'application' or 'delegated'",
      );
    });
  });

  describe("Config Functions", () => {
    it("should cache configuration after first load", () => {
      process.env = { ...applicationModeEnv };

      const config1 = getAzureAuthConfig();
      const config2 = getAzureAuthConfig();

      expect(config1).toBe(config2);
    });

    it("should return delegated credential config", () => {
      process.env = { ...delegatedModeWithSecretEnv };

      const config = getDelegatedCredentialConfig();

      expect(config.clientId).toBe("test-client-id");
      expect(config.tenantId).toBe("test-tenant-id");
    });

    it("should return application client manager config", () => {
      process.env = { ...applicationModeEnv };

      const config = getApplicationClientManagerConfig();

      expect(config.cacheKeyPrefix).toBe("client");
    });
  });
});
