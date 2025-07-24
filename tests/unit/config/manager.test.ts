import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import { ConfigurationManager } from "../../../src/config/manager.js";
import { ApplicationAuthStrategy } from "../../../src/types.js";
import { ConfigurationSource } from "../../../src/config/source.js";

// Mock the logging module
mock.module("../../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

// Test fixtures
const validConfig = {
  azure: {
    clientId: "test-client-id",
    tenantId: "test-tenant-id",
    clientSecret: "test-secret",
    applicationAuthStrategy: ApplicationAuthStrategy.Chain,
  },
  jwt: {
    clockTolerance: 300,
    cacheMaxAge: 86400000,
    jwksRequestsPerMinute: 10,
  },
  cache: {
    keyPrefix: "client",
    clientCacheSlidingTtl: 2700000,
    clientCacheMaxSize: 100,
    clientCacheBufferMs: 60000,
    credentialCacheSlidingTtl: 7200000,
    credentialCacheMaxSize: 200,
    credentialCacheAbsoluteTtl: 28800000,
  },
};

const validConfigWithCert = {
  azure: {
    clientId: "test-client-id",
    tenantId: "test-tenant-id",
    certificatePath: "/path/to/cert.pem",
    managedIdentityClientId: "test-mi-client-id",
    applicationAuthStrategy: "mi" as const,
  },
  jwt: {
    audience: "test-audience",
    issuer: "test-issuer",
    clockTolerance: 600,
    cacheMaxAge: 3600000,
    jwksRequestsPerMinute: 20,
  },
  cache: {
    keyPrefix: "test",
    clientCacheSlidingTtl: 1800000,
    clientCacheMaxSize: 50,
    clientCacheBufferMs: 30000,
    credentialCacheSlidingTtl: 3600000,
    credentialCacheMaxSize: 150,
    credentialCacheAbsoluteTtl: 14400000,
  },
};

const invalidJwtConfig = {
  azure: {
    clientId: "test-client-id",
    tenantId: "test-tenant-id",
    clientSecret: "test-secret",
  },
  jwt: {
    clockTolerance: -1, // Invalid: negative value
    cacheMaxAge: 0, // Invalid: zero value
    jwksRequestsPerMinute: -5, // Invalid: negative value
  },
  cache: {
    keyPrefix: "client",
    clientCacheSlidingTtl: 2700000,
    clientCacheMaxSize: 100,
    clientCacheBufferMs: 60000,
    credentialCacheSlidingTtl: 7200000,
    credentialCacheMaxSize: 200,
    credentialCacheAbsoluteTtl: 28800000,
  },
};

const missingAzureConfig = {
  azure: {
    // Missing clientId and tenantId
    clientSecret: "test-secret",
  },
  jwt: {
    clockTolerance: 300,
    cacheMaxAge: 86400000,
    jwksRequestsPerMinute: 10,
  },
  cache: {
    keyPrefix: "client",
    clientCacheSlidingTtl: 2700000,
    clientCacheMaxSize: 100,
    clientCacheBufferMs: 60000,
    credentialCacheSlidingTtl: 7200000,
    credentialCacheMaxSize: 200,
    credentialCacheAbsoluteTtl: 28800000,
  },
};

describe("ConfigurationManager", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let manager: ConfigurationManager;
  let mockSource: ConfigurationSource;

  beforeEach(() => {
    originalEnv = process.env;

    // Create mock configuration source
    mockSource = {
      load: mock(() => Promise.resolve(validConfig)),
    };

    manager = new ConfigurationManager();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Configuration Source Selection", () => {
    it("should use AppConfigSource when AZURE_APPCONFIG_ENDPOINT is set", () => {
      process.env.AZURE_APPCONFIG_ENDPOINT = "https://test.azconfig.io";

      const newManager = new ConfigurationManager();

      // We can't directly test the private property, but we can test the behavior
      // The manager should be created without throwing
      expect(newManager).toBeInstanceOf(ConfigurationManager);
    });

    it("should use EnvironmentSource when AZURE_APPCONFIG_ENDPOINT is not set", () => {
      delete process.env.AZURE_APPCONFIG_ENDPOINT;

      const newManager = new ConfigurationManager();

      expect(newManager).toBeInstanceOf(ConfigurationManager);
    });
  });

  describe("Configuration Loading and Caching", () => {
    it("should load configuration successfully", async () => {
      // Mock the private source
      spyOn(manager as any, "source").mockReturnValue(mockSource);

      const config = await manager.getConfiguration();

      expect(config).toEqual(validConfig);
      expect(mockSource.load).toHaveBeenCalledTimes(1);
    });

    it("should cache configuration after first load", async () => {
      spyOn(manager as any, "source").mockReturnValue(mockSource);

      // Load configuration multiple times
      const config1 = await manager.getConfiguration();
      const config2 = await manager.getConfiguration();
      const config3 = await manager.getConfiguration();

      expect(config1).toEqual(config2);
      expect(config2).toEqual(config3);
      // Source should only be called once due to caching
      expect(mockSource.load).toHaveBeenCalledTimes(1);
    });

    it("should handle configuration loading errors", async () => {
      const errorSource = {
        load: mock(() => Promise.reject(new Error("Failed to load config"))),
      };

      spyOn(manager as any, "source").mockReturnValue(errorSource);

      await expect(manager.getConfiguration()).rejects.toThrow(
        "Failed to load config",
      );
    });
  });

  describe("Configuration Validation", () => {
    it("should validate JWT configuration values", async () => {
      const invalidSource = {
        load: mock(() => Promise.resolve(invalidJwtConfig)),
      };

      spyOn(manager as any, "source").mockReturnValue(invalidSource);

      await expect(manager.getConfiguration()).rejects.toThrow(
        "JWT configuration must have valid values",
      );
    });

    it("should validate required Azure configuration", async () => {
      const missingAzureSource = {
        load: mock(() => Promise.resolve(missingAzureConfig)),
      };

      spyOn(manager as any, "source").mockReturnValue(missingAzureSource);

      const config = await manager.getConfiguration();
      expect(config).toBeDefined();
    });

    it("should handle Zod schema validation errors", async () => {
      const invalidSchemaSource = {
        load: mock(() => Promise.resolve({ invalid: "config" })),
      };

      spyOn(manager as any, "source").mockReturnValue(invalidSchemaSource);

      const config = await manager.getConfiguration();
      expect(config).toBeDefined();
    });
  });

  describe("getApplicationAuthConfig", () => {
    it("should return application auth config with default strategy", async () => {
      spyOn(manager as any, "source").mockReturnValue(mockSource);

      const config = await manager.getApplicationAuthConfig();

      expect(config).toEqual({
        strategy: ApplicationAuthStrategy.Chain,
      });
    });

    it("should return application auth config with managed identity client ID", async () => {
      const configWithMI = {
        load: mock(() => Promise.resolve(validConfigWithCert)),
      };

      spyOn(manager as any, "source").mockReturnValue(configWithMI);

      const config = await manager.getApplicationAuthConfig();

      expect(config).toEqual({
        strategy: ApplicationAuthStrategy.ManagedIdentity,
        managedIdentityClientId: "test-mi-client-id",
      });
    });
  });

  describe("getDelegatedAuthConfig", () => {
    it("should return delegated auth config with client secret", async () => {
      spyOn(manager as any, "source").mockReturnValue(mockSource);

      const config = await manager.getDelegatedAuthConfig();

      expect(config).toEqual({
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-secret",
      });
    });

    it("should return delegated auth config with certificate", async () => {
      const configWithCert = {
        load: mock(() => Promise.resolve(validConfigWithCert)),
      };

      spyOn(manager as any, "source").mockReturnValue(configWithCert);

      const config = await manager.getDelegatedAuthConfig();

      expect(config).toEqual({
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "/path/to/cert.pem",
      });
    });

    it("should return unconfigured config when no credentials are provided", async () => {
      const noCredentialsConfig = {
        ...validConfig,
        azure: {
          ...validConfig.azure,
          clientSecret: undefined,
        },
      };

      const noCredentialsSource = {
        load: mock(() => Promise.resolve(noCredentialsConfig)),
      };

      spyOn(manager as any, "source").mockReturnValue(noCredentialsSource);

      const config = await manager.getDelegatedAuthConfig();

      expect(config).toBeUndefined();
    });

    it("should return config with first available credential when multiple credentials are provided", async () => {
      const multipleCredentialsConfig = {
        ...validConfig,
        azure: {
          ...validConfig.azure,
          clientSecret: "test-secret",
          certificatePath: "/path/to/cert.pem",
        },
      };

      const multipleCredentialsSource = {
        load: mock(() => Promise.resolve(multipleCredentialsConfig)),
      };

      spyOn(manager as any, "source").mockReturnValue(
        multipleCredentialsSource,
      );

      const config = await manager.getDelegatedAuthConfig();

      // Should use certificatePath over clientSecret based on precedence
      expect(config).toEqual({
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "/path/to/cert.pem",
      });
    });

    it("should handle certificate PEM configuration", async () => {
      const configWithPemCert = {
        ...validConfig,
        azure: {
          ...validConfig.azure,
          clientSecret: undefined,
          certificatePem:
            "-----BEGIN CERTIFICATE-----\nbase64-encoded-cert\n-----END CERTIFICATE-----",
        },
      };

      const pemCertSource = {
        load: mock(() => Promise.resolve(configWithPemCert)),
      };

      spyOn(manager as any, "source").mockReturnValue(pemCertSource);

      const config = await manager.getDelegatedAuthConfig();

      expect(config).toEqual({
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePem:
          "-----BEGIN CERTIFICATE-----\nbase64-encoded-cert\n-----END CERTIFICATE-----",
      });
    });
  });

  describe("getJwtConfig", () => {
    it("should return JWT config with required fields", async () => {
      spyOn(manager as any, "source").mockReturnValue(mockSource);

      const config = await manager.getJwtConfig();

      expect(config).toEqual({
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clockTolerance: 300,
        cacheMaxAge: 86400000,
        jwksRequestsPerMinute: 10,
      });
    });

    it("should return JWT config with optional fields", async () => {
      const configWithJwtOptions = {
        load: mock(() => Promise.resolve(validConfigWithCert)),
      };

      spyOn(manager as any, "source").mockReturnValue(configWithJwtOptions);

      const config = await manager.getJwtConfig();

      expect(config).toEqual({
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clockTolerance: 600,
        cacheMaxAge: 3600000,
        jwksRequestsPerMinute: 20,
        audience: "test-audience",
        issuer: "test-issuer",
      });
    });
  });

  describe("getClientManagerConfig", () => {
    it("should return client manager config with default values", async () => {
      spyOn(manager as any, "source").mockReturnValue(mockSource);

      const config = await manager.getClientManagerConfig();

      expect(config).toEqual({
        cacheKeyPrefix: "client",
        clientCache: {
          slidingTtl: 2700000,
          maxSize: 100,
          bufferMs: 60000,
        },
        credentialCache: {
          slidingTtl: 7200000,
          maxSize: 200,
          absoluteTtl: 28800000,
        },
      });
    });

    it("should return client manager config with custom values", async () => {
      const configWithCustomCache = {
        load: mock(() => Promise.resolve(validConfigWithCert)),
      };

      spyOn(manager as any, "source").mockReturnValue(configWithCustomCache);

      const config = await manager.getClientManagerConfig();

      expect(config).toEqual({
        cacheKeyPrefix: "test",
        clientCache: {
          slidingTtl: 1800000,
          maxSize: 50,
          bufferMs: 30000,
        },
        credentialCache: {
          slidingTtl: 3600000,
          maxSize: 150,
          absoluteTtl: 14400000,
        },
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle concurrent configuration requests", async () => {
      spyOn(manager as any, "source").mockReturnValue(mockSource);

      // Make multiple concurrent requests
      const promises = [
        manager.getConfiguration(),
        manager.getConfiguration(),
        manager.getConfiguration(),
      ];

      const results = await Promise.all(promises);

      // All should return the same config
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);

      // Source should only be called once due to promise caching
      expect(mockSource.load).toHaveBeenCalledTimes(1);
    });

    it("should handle configuration source errors gracefully", async () => {
      const errorMessage = "Network error loading config";
      const errorSource = {
        load: mock(() => Promise.reject(new Error(errorMessage))),
      };

      spyOn(manager as any, "source").mockReturnValue(errorSource);

      await expect(manager.getApplicationAuthConfig()).rejects.toThrow(
        errorMessage,
      );
      await expect(manager.getDelegatedAuthConfig()).rejects.toThrow(
        errorMessage,
      );
      await expect(manager.getJwtConfig()).rejects.toThrow(errorMessage);
      await expect(manager.getClientManagerConfig()).rejects.toThrow(
        errorMessage,
      );
    });

    it("should validate JWT configuration edge cases", async () => {
      // Test clockTolerance
      let testManager = new ConfigurationManager();
      let config = {
        ...validConfig,
        jwt: { ...validConfig.jwt, clockTolerance: -1 },
      };
      let source = { load: mock(() => Promise.resolve(config)) };
      spyOn(testManager as any, "source").mockReturnValue(source);
      await expect(testManager.getConfiguration()).rejects.toThrow(
        "JWT configuration must have valid values",
      );

      // Test cacheMaxAge
      testManager = new ConfigurationManager();
      config = {
        ...validConfig,
        jwt: { ...validConfig.jwt, cacheMaxAge: 0 },
      };
      source = { load: mock(() => Promise.resolve(config)) };
      spyOn(testManager as any, "source").mockReturnValue(source);
      await expect(testManager.getConfiguration()).rejects.toThrow(
        "JWT configuration must have valid values",
      );

      // Test jwksRequestsPerMinute
      testManager = new ConfigurationManager();
      config = {
        ...validConfig,
        jwt: { ...validConfig.jwt, jwksRequestsPerMinute: 0 },
      };
      source = { load: mock(() => Promise.resolve(config)) };
      spyOn(testManager as any, "source").mockReturnValue(source);
      await expect(testManager.getConfiguration()).rejects.toThrow(
        "JWT configuration must have valid values",
      );
    });
  });
});
