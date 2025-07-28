import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { ClientProviderImpl } from "../../../src/client-pool/client-provider.js";
import { AuthMode, type AuthRequest } from "../../../src/types.js";
import type { ClientManagerConfig } from "../../../src/config/configuration.js";
import { ParsedJwtToken } from "../../../src/auth/jwt/token.js";

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

const mockJwtHandler = {
  validateToken: mock(async (token: string) => {
    const claims = {
      userObjectId: "user-123",
      tenantId: "tenant-456", 
      expiresAt: Date.now() + 3600000,
    };
    return new ParsedJwtToken(claims, token);
  }),
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
      mockJwtHandler as any,
    );

    // Reset mocks
    mockClientFactory.createClient.mockClear();
    mockClientFactory.getClientFingerprint.mockClear();
    mockCredentialManager.getCredential.mockClear();
  });

  describe("validateAuthContext", () => {
    it("should accept valid application auth context", () => {
      const authContext = { mode: AuthMode.Application };

      expect(() => provider["validateAuthContext"](authContext as any)).not.toThrow();
    });

    it("should throw error for delegated context without tenantId", () => {
      const authContext = { 
        mode: AuthMode.Delegated, 
        userObjectId: "user-123",
        accessToken: "token",
        expiresAt: Date.now() + 3600000
      };

      expect(() => provider["validateAuthContext"](authContext as any)).toThrow(
        "tenantId is required for delegated/composite authentication",
      );
    });

    it("should throw error for delegated context without userObjectId", () => {
      const authContext = { 
        mode: AuthMode.Delegated,
        tenantId: "tenant-456",
        accessToken: "token", 
        expiresAt: Date.now() + 3600000
      };

      expect(() => provider["validateAuthContext"](authContext as any)).toThrow(
        "userObjectId is required for delegated/composite authentication",
      );
    });

    it("should accept valid delegated auth context", () => {
      const authContext = {
        mode: AuthMode.Delegated,
        tenantId: "tenant-456",
        userObjectId: "user-123",
        accessToken: "token",
        expiresAt: Date.now() + 3600000
      };

      expect(() => provider["validateAuthContext"](authContext as any)).not.toThrow();
    });
  });

  describe("generateRawCacheKey", () => {
    it("should generate application mode cache key", () => {
      const authContext = { mode: AuthMode.Application };

      const key = provider["generateRawCacheKey"](authContext as any);

      expect(key).toBe("test::application");
    });

    it("should generate delegated mode cache key with user info", () => {
      const authContext = {
        mode: AuthMode.Delegated,
        tenantId: "tenant-456",
        userObjectId: "user-123",
        accessToken: "token",
        expiresAt: Date.now() + 3600000
      };

      const key = provider["generateRawCacheKey"](authContext as any);

      expect(key).toBe("test::delegated::tenant:tenant-456::user:user-123");
    });

    it("should include fingerprint when factory provides one", () => {
      const authContext = { mode: AuthMode.Application };
      const options = { endpoint: "custom" };

      const key = provider["generateRawCacheKey"](authContext as any, options);

      expect(key).toBe(
        'test::application::fingerprint:fingerprint-{"endpoint":"custom"}',
      );
      expect(mockClientFactory.getClientFingerprint).toHaveBeenCalledWith(
        options,
      );
    });

    it("should include serialized options when no fingerprint available", () => {
      mockClientFactory.getClientFingerprint.mockReturnValue(undefined);
      const authContext = { mode: AuthMode.Application };
      const options = { endpoint: "custom" };

      const key = provider["generateRawCacheKey"](authContext as any, options);

      expect(key).toContain("test::application::options:");
    });

    it("should generate composite mode cache key", () => {
      const authContext = {
        mode: AuthMode.Composite,
        tenantId: "tenant-456", 
        userObjectId: "admin-123",
        accessToken: "token",
        expiresAt: Date.now() + 3600000
      };

      const key = provider["generateRawCacheKey"](authContext as any);

      expect(key).toBe("test::composite::tenant:tenant-456::user:admin-123");
    });
  });

  describe("serializeOptions", () => {
    it("should serialize options with sorted keys", () => {
      const options = { b: 2, a: 1, c: 3 };

      const serialized = provider["serializeOptions"](options);
      
      // Should be deterministic hash
      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe("string");
      expect(serialized.length).toBeGreaterThan(0);
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
      const soon = Date.now() + 10 * 60 * 1000;
      mockJwtHandler.validateToken.mockResolvedValueOnce(
        new ParsedJwtToken({
          userObjectId: "user-123",
          tenantId: "tenant-456",
          expiresAt: soon,
        }, "test-token")
      );

      const authRequest: AuthRequest = { 
        mode: AuthMode.Delegated, 
        userAssertionToken: "test-token" 
      };

      const spy = spyOn(provider["clientCache"], "getOrCreate");

      await provider.getClient(authRequest);

      expect(spy).toHaveBeenCalled();
      const [, , customTtl] = spy.mock.calls[0];
      expect(customTtl).toBeLessThan(10 * 60 * 1000);
      expect(customTtl).toBeGreaterThan(0);
    });

    it("should reject expired tokens", async () => {
      const expired = Date.now() - 1000;
      mockJwtHandler.validateToken.mockResolvedValueOnce(
        new ParsedJwtToken({
          userObjectId: "user-123", 
          tenantId: "tenant-456",
          expiresAt: expired,
        }, "expired-token")
      );

      const authRequest: AuthRequest = { 
        mode: AuthMode.Delegated, 
        userAssertionToken: "expired-token" 
      };

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

    it("should validate auth context before invalidating", async () => {
      mockJwtHandler.validateToken.mockResolvedValueOnce(
        new ParsedJwtToken({
          userObjectId: "user-123",
          tenantId: "",
          expiresAt: Date.now() + 3600000,
        }, "invalid-token")
      );

      const authRequest: AuthRequest = { 
        mode: AuthMode.Delegated, 
        userAssertionToken: "invalid-token" 
      };

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
      mockClientFactory.createClient.mockClear();
      mockCredentialManager.getCredential.mockClear();
      mockClientFactory.createClient.mockResolvedValue({
        mockType: "MockClient",
      });
      mockCredentialManager.getCredential.mockResolvedValue({} as any);

      const nowMs = Date.now();
      // Set expiry to current time to make token expired
      const expiry = nowMs;

      mockJwtHandler.validateToken.mockResolvedValueOnce(
        new ParsedJwtToken({
          userObjectId: "user-123",
          tenantId: "tenant-456", 
          expiresAt: expiry,
        }, "short-lived-token")
      );

      const authRequest: AuthRequest = {
        mode: AuthMode.Delegated,
        userAssertionToken: "short-lived-token",
      };

      await expect(provider.getClient(authRequest)).rejects.toThrow(
        "Token has already expired",
      );
    });

    it("should handle undefined options", async () => {
      const authContext = { mode: AuthMode.Application };

      const key = provider["generateRawCacheKey"](authContext as any, undefined);

      expect(key).toBe("test::application");
    });

    it("should handle empty objects as options", async () => {
      const authRequest: AuthRequest = { mode: AuthMode.Application };

      const key = provider["generateRawCacheKey"](authRequest, {});

      expect(key).toContain("test::application::options:");
    });
  });
});
