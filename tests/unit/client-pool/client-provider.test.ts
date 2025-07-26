import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { ClientProviderImpl } from "../../../src/client-pool/client-provider.js";
import { AuthMode, type AuthRequest } from "../../../src/types.js";
import { Identity } from "@jhzhu89/jwt-validator";
import type { ClientManagerConfig } from "../../../src/config/configuration.js";

// Mock dependencies
const mockCredentialManager = {
  getCredential: mock(async () => ({ mockType: "MockCredential" })),
};

const mockClientFactory = {
  createClient: mock(async (credentialProvider: any, options?: any) => ({
    mockType: "MockClient",
  })),
  getClientFingerprint: mock((options?: any) =>
    options ? `fingerprint-${JSON.stringify(options)}` : undefined,
  ),
};

mock.module("../../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

describe("ClientProviderImpl", () => {
  let provider: ClientProviderImpl<any, any>;
  let config: ClientManagerConfig;

  beforeEach(() => {
    config = {
      cacheKeyPrefix: "test",
      clientCache: {
        slidingTtl: 45 * 60 * 1000, // 45 minutes
        maxSize: 100,
        bufferMs: 60 * 1000, // 1 minute
      },
      credentialCache: {
        slidingTtl: 30 * 60 * 1000,
        maxSize: 200,
        absoluteTtl: 8 * 60 * 60 * 1000,
      },
    };

    provider = new ClientProviderImpl(
      mockClientFactory,
      mockCredentialManager as any,
      config,
    );

    // Reset mocks
    mockClientFactory.createClient.mockClear();
    mockClientFactory.getClientFingerprint.mockClear();
    mockCredentialManager.getCredential.mockClear();
  });

  describe("validateAuthRequest", () => {
    it("should accept valid application auth request", () => {
      const authRequest: AuthRequest = { mode: AuthMode.Application };

      expect(() => provider["validateAuthRequest"](authRequest)).not.toThrow();
    });

    it("should throw error for delegated request without tenantId", () => {
      const identity = new Identity("token", { oid: "user-123" });
      const authRequest: AuthRequest = { mode: AuthMode.Delegated, identity };

      expect(() => provider["validateAuthRequest"](authRequest)).toThrow(
        "tenantId is required for delegated/composite authentication",
      );
    });

    it("should throw error for delegated request without userObjectId", () => {
      const identity = new Identity("token", { tid: "tenant-456" });
      const authRequest: AuthRequest = { mode: AuthMode.Delegated, identity };

      expect(() => provider["validateAuthRequest"](authRequest)).toThrow(
        "userObjectId is required for delegated/composite authentication",
      );
    });

    it("should accept valid delegated auth request", () => {
      const identity = new Identity("token", {
        oid: "user-123",
        tid: "tenant-456",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const authRequest: AuthRequest = { mode: AuthMode.Delegated, identity };

      expect(() => provider["validateAuthRequest"](authRequest)).not.toThrow();
    });
  });

  describe("generateRawCacheKey", () => {
    it("should generate application mode cache key", () => {
      const authRequest: AuthRequest = { mode: AuthMode.Application };

      const key = provider["generateRawCacheKey"](authRequest);

      expect(key).toBe("test::application");
    });

    it("should generate delegated mode cache key with user info", () => {
      const identity = new Identity("token", {
        oid: "user-123",
        tid: "tenant-456",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const authRequest: AuthRequest = { mode: AuthMode.Delegated, identity };

      const key = provider["generateRawCacheKey"](authRequest);

      expect(key).toBe("test::delegated::tenant:tenant-456::user:user-123");
    });

    it("should include fingerprint when factory provides one", () => {
      const authRequest: AuthRequest = { mode: AuthMode.Application };
      const options = { endpoint: "custom" };

      const key = provider["generateRawCacheKey"](authRequest, options);

      expect(key).toBe(
        'test::application::fingerprint:fingerprint-{"endpoint":"custom"}',
      );
      expect(mockClientFactory.getClientFingerprint).toHaveBeenCalledWith(
        options,
      );
    });

    it("should include serialized options when no fingerprint available", () => {
      mockClientFactory.getClientFingerprint.mockReturnValue(undefined);
      const authRequest: AuthRequest = { mode: AuthMode.Application };
      const options = { endpoint: "custom" };

      const key = provider["generateRawCacheKey"](authRequest, options);

      expect(key).toContain("test::application::options:");
    });

    it("should generate composite mode cache key", () => {
      const identity = new Identity("token", {
        oid: "admin-123",
        tid: "tenant-456",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const authRequest: AuthRequest = { mode: AuthMode.Composite, identity };

      const key = provider["generateRawCacheKey"](authRequest);

      expect(key).toBe("test::composite::tenant:tenant-456::user:admin-123");
    });
  });

  describe("serializeOptions", () => {
    it("should serialize options with sorted keys", () => {
      const options = { b: 2, a: 1, c: 3 };

      const serialized = provider["serializeOptions"](options);

      // Should be deterministic regardless of property order
      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe("string");
    });

    it("should handle nested objects", () => {
      const options = {
        config: { port: 443, host: "example.com" },
        name: "test",
      };

      const serialized = provider["serializeOptions"](options);

      expect(serialized).toBeDefined();
    });

    it("should produce same result for equivalent objects", () => {
      const options1 = { a: 1, b: 2 };
      const options2 = { b: 2, a: 1 };

      const serialized1 = provider["serializeOptions"](options1);
      const serialized2 = provider["serializeOptions"](options2);

      expect(serialized1).toBe(serialized2);
    });
  });

  describe("getClient with TTL calculation", () => {
    it("should use custom TTL for soon-to-expire tokens", async () => {
      const soon = Date.now() + 10 * 60 * 1000; // 10 minutes from now
      const identity = new Identity("token", {
        oid: "user-123",
        tid: "tenant-456",
        exp: Math.floor(soon / 1000),
      });
      const authRequest: AuthRequest = { mode: AuthMode.Delegated, identity };

      const spy = spyOn(provider["clientCache"], "getOrCreate");

      await provider.getClient(authRequest);

      // Should be called with custom TTL that accounts for buffer
      expect(spy).toHaveBeenCalled();
      const [, , customTtl] = spy.mock.calls[0];
      expect(customTtl).toBeLessThan(10 * 60 * 1000); // Less than 10 minutes
      expect(customTtl).toBeGreaterThan(0);
    });

    it("should reject expired tokens", async () => {
      const expired = Date.now() - 1000; // 1 second ago
      const identity = new Identity("token", {
        oid: "user-123",
        tid: "tenant-456",
        exp: Math.floor(expired / 1000),
      });
      const authRequest: AuthRequest = { mode: AuthMode.Delegated, identity };

      await expect(provider.getClient(authRequest)).rejects.toThrow(
        "Token has already expired",
      );
    });

    it("should not use custom TTL for application mode", async () => {
      const authRequest: AuthRequest = { mode: AuthMode.Application };

      const spy = spyOn(provider["clientCache"], "getOrCreate");

      await provider.getClient(authRequest);

      // Should be called without custom TTL (undefined)
      expect(spy).toHaveBeenCalled();
      const [, , customTtl] = spy.mock.calls[0];
      expect(customTtl).toBeUndefined();
    });
  });

  describe("invalidateClientCache", () => {
    it("should invalidate cache for specific auth request", async () => {
      const authRequest: AuthRequest = { mode: AuthMode.Application };

      const spy = spyOn(provider["clientCache"], "delete").mockReturnValue(
        true,
      );

      const result = await provider.invalidateClientCache(authRequest);

      expect(result).toBe(true);
      expect(spy).toHaveBeenCalled();
    });

    it("should return false when no cache entry exists", async () => {
      const authRequest: AuthRequest = { mode: AuthMode.Application };

      spyOn(provider["clientCache"], "delete").mockReturnValue(false);

      const result = await provider.invalidateClientCache(authRequest);

      expect(result).toBe(false);
    });

    it("should validate auth request before invalidating", async () => {
      const identity = new Identity("token", { oid: "user-123" }); // Missing tenantId
      const authRequest: AuthRequest = { mode: AuthMode.Delegated, identity };

      await expect(provider.invalidateClientCache(authRequest)).rejects.toThrow(
        "tenantId is required for delegated/composite authentication",
      );
    });
  });

  describe("error handling", () => {
    it("should handle client factory errors gracefully", async () => {
      // Reset mocks first
      mockClientFactory.createClient.mockClear();
      mockCredentialManager.getCredential.mockClear();

      mockClientFactory.createClient.mockRejectedValue(
        new Error("Factory error"),
      );
      const authRequest: AuthRequest = { mode: AuthMode.Application };

      await expect(provider.getClient(authRequest)).rejects.toThrow(
        "Factory error",
      );
    });

    it("should handle credential manager errors", async () => {
      // Reset mocks first
      mockClientFactory.createClient.mockClear();
      mockCredentialManager.getCredential.mockClear();

      // Make getCredential fail
      mockCredentialManager.getCredential.mockRejectedValue(
        new Error("Credential error"),
      );

      // Make createClient call the credential provider, which will trigger getCredential
      mockClientFactory.createClient.mockImplementation(
        async (credentialProvider: any) => {
          // Simulate the client factory calling getCredential
          await credentialProvider.getCredential("application");
          return { mockType: "MockClient" };
        },
      );

      const authRequest: AuthRequest = { mode: AuthMode.Application };

      await expect(provider.getClient(authRequest)).rejects.toThrow(
        "Credential error",
      );
    });
  });

  describe("edge cases", () => {
    it("should handle zero TTL tokens", async () => {
      // Reset mocks to default behavior first
      mockClientFactory.createClient.mockClear();
      mockCredentialManager.getCredential.mockClear();
      mockClientFactory.createClient.mockResolvedValue({
        mockType: "MockClient",
      });
      mockCredentialManager.getCredential.mockResolvedValue({} as any);

      // Create a token that will result in 0 TTL after buffer calculation
      const nowMs = Date.now();
      const bufferMs = config.clientCache.bufferMs;
      const expiry = Math.floor((nowMs + bufferMs - 1000) / 1000); // Will result in negative remaining time -> 0 TTL

      const identity = new Identity("token", {
        oid: "user-123",
        tid: "tenant-456",
        exp: expiry,
      });
      const authRequest: AuthRequest = {
        mode: AuthMode.Delegated,
        identity,
      };

      // When TTL is 0, the cache library throws an error
      await expect(provider.getClient(authRequest)).rejects.toThrow(
        "ttl must be positive integer or Infinity",
      );
    });

    it("should handle undefined options", async () => {
      const authRequest: AuthRequest = { mode: AuthMode.Application };

      const key = provider["generateRawCacheKey"](authRequest, undefined);

      expect(key).toBe("test::application");
    });

    it("should handle empty objects as options", async () => {
      const authRequest: AuthRequest = { mode: AuthMode.Application };

      const key = provider["generateRawCacheKey"](authRequest, {});

      expect(key).toContain("test::application::options:");
    });
  });
});
