import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  getApplicationAuthConfig,
  getDelegatedAuthConfig,
  getJwtConfig,
  getClientManagerConfig,
  resetConfigCache,
} from "../../../src/config/configuration.js";
import {
  applicationModeEnv,
  delegatedModeWithSecretEnv,
  delegatedModeWithCertEnv,
  delegatedModeInvalidEnv,
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

  describe("getApplicationAuthConfig", () => {
    it("should load application mode configuration", () => {
      process.env = { ...applicationModeEnv };

      const config = getApplicationAuthConfig();

      expect(config.strategy).toBeDefined();
      expect(typeof config.strategy).toBe("string");
    });

    it("should handle missing environment variables gracefully", () => {
      process.env = { NODE_ENV: "test" };

      expect(() => getApplicationAuthConfig()).not.toThrow();
    });
  });

  describe("getDelegatedAuthConfig", () => {
    it("should load delegated mode configuration with client secret", () => {
      process.env = { ...delegatedModeWithSecretEnv };

      const config = getDelegatedAuthConfig();

      expect(config.clientId).toBe("test-client-id");
      expect(config.tenantId).toBe("test-tenant-id");
      expect(config.clientSecret).toBe("test-client-secret");
    });

    it("should load delegated mode configuration with certificate", () => {
      process.env = { ...delegatedModeWithCertEnv };

      const config = getDelegatedAuthConfig();

      expect(config.clientId).toBe("test-client-id");
      expect(config.tenantId).toBe("test-tenant-id");
      expect(config.certificatePath).toBe("/path/to/cert.pem");
      expect(config.certificatePassword).toBe("cert-password");
      expect(config.clientSecret).toBeUndefined();
    });

    it("should throw error for missing required environment variables", () => {
      process.env = { ...delegatedModeInvalidEnv };

      expect(() => getDelegatedAuthConfig()).toThrow();
    });

    it("should throw error when both secret and certificate are provided", () => {
      process.env = {
        AZURE_CLIENT_ID: "test-client-id",
        AZURE_TENANT_ID: "test-tenant-id",
        AZURE_CLIENT_SECRET: "test-client-secret",
        AZURE_CLIENT_CERTIFICATE_PATH: "/path/to/cert.pem",
        NODE_ENV: "test",
      };

      expect(() => getDelegatedAuthConfig()).toThrow(
        "Only one of AZURE_CLIENT_SECRET or AZURE_CLIENT_CERTIFICATE_PATH should be set",
      );
    });
  });

  describe("getJwtConfig", () => {
    it("should create JWT configuration with defaults", () => {
      process.env = { ...delegatedModeWithSecretEnv };

      const config = getJwtConfig();

      expect(config.clientId).toBe("test-client-id");
      expect(config.tenantId).toBe("test-tenant-id");
      expect(config.clockTolerance).toBeDefined();
      expect(config.cacheMaxAge).toBeDefined();
      expect(config.jwksRequestsPerMinute).toBeDefined();
    });

    it("should use custom JWT configuration from environment", () => {
      process.env = {
        ...delegatedModeWithSecretEnv,
        JWT_AUDIENCE: "test-audience",
        JWT_ISSUER: "test-issuer",
        JWT_CLOCK_TOLERANCE: "600",
        JWT_CACHE_MAX_AGE: "172800000",
        JWKS_REQUESTS_PER_MINUTE: "20",
      };

      const config = getJwtConfig();

      expect(config.audience).toBe("test-audience");
      expect(config.issuer).toBe("test-issuer");
      expect(config.clockTolerance).toBe(600);
      expect(config.cacheMaxAge).toBe(172800000);
      expect(config.jwksRequestsPerMinute).toBe(20);
    });
  });

  describe("getClientManagerConfig", () => {
    it("should return client manager configuration with defaults", () => {
      process.env = { ...applicationModeEnv };

      const config = getClientManagerConfig();

      expect(config.cacheKeyPrefix).toBeDefined();
      expect(config.clientCache).toBeDefined();
      expect(config.clientCache.slidingTtl).toBeGreaterThan(0);
      expect(config.clientCache.maxSize).toBeGreaterThan(0);
      expect(config.credentialCache).toBeDefined();
      expect(config.credentialCache.slidingTtl).toBeGreaterThan(0);
      expect(config.credentialCache.maxSize).toBeGreaterThan(0);
      expect(config.credentialCache.absoluteTtl).toBeGreaterThan(0);
    });

    it("should use custom cache configuration from environment", () => {
      process.env = {
        ...applicationModeEnv,
        CACHE_KEY_PREFIX: "custom",
        CACHE_CLIENT_SLIDING_TTL: "3600000",
        CACHE_CLIENT_MAX_SIZE: "25",
        CACHE_CREDENTIAL_SLIDING_TTL: "1800000",
        CACHE_CREDENTIAL_MAX_SIZE: "5",
        CACHE_CREDENTIAL_ABSOLUTE_TTL: "7200000",
      };

      const config = getClientManagerConfig();

      expect(config.cacheKeyPrefix).toBe("custom");
      expect(config.clientCache.slidingTtl).toBe(3600000);
      expect(config.clientCache.maxSize).toBe(25);
      expect(config.credentialCache.slidingTtl).toBe(1800000);
      expect(config.credentialCache.maxSize).toBe(5);
      expect(config.credentialCache.absoluteTtl).toBe(7200000);
    });
  });

  describe("Configuration Caching", () => {
    it("should cache configuration after first load", () => {
      process.env = { ...applicationModeEnv };

      const config1 = getApplicationAuthConfig();
      const config2 = getApplicationAuthConfig();

      // Should return the same configuration values
      expect(config1).toEqual(config2);
      expect(config1.strategy).toBe(config2.strategy);
    });

    it("should reset cache when resetConfigCache is called", () => {
      process.env = { ...applicationModeEnv };

      const config1 = getApplicationAuthConfig();
      resetConfigCache();

      // Change environment
      process.env = {
        ...applicationModeEnv,
        AZURE_APPLICATION_AUTH_STRATEGY: "cli",
      };
      const config2 = getApplicationAuthConfig();

      // Should be different instances after cache reset
      expect(config1).not.toBe(config2);
    });
  });
});
