import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { CredentialManager } from "../../../src/credentials/manager.js";
import { type TokenBasedAuthContext } from "../../../src/auth/context.js";
import { AuthMode, CredentialType } from "../../../src/types.js";
import {
  type ClientManagerConfig,
  type ApplicationAuthConfig,
  type DelegatedAuthConfig,
} from "../../../src/config/configuration.js";

const MockTokenCredential = mock(function () {
  return { mockType: "TokenCredential" };
});

mock.module("@azure/identity", () => ({
  AzureCliCredential: mock(() => ({ mockType: "AzureCliCredential" })),
  OnBehalfOfCredential: MockTokenCredential,
}));

mock.module("../../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

describe("CredentialManager", () => {
  let manager: CredentialManager;
  let applicationConfig: ApplicationAuthConfig;
  let delegatedConfig: DelegatedAuthConfig;
  let clientManagerConfig: ClientManagerConfig;
  let authContext: TokenBasedAuthContext;

  beforeEach(() => {
    applicationConfig = {
      strategy: "cli" as any,
    };

    delegatedConfig = {
      clientId: "test-client-id",
      tenantId: "test-tenant-id",
      clientSecret: "test-client-secret",
    };

    clientManagerConfig = {
      cacheKeyPrefix: "test",
      clientCache: {
        slidingTtl: 45 * 60 * 1000,
        maxSize: 100,
      },
      credentialCache: {
        slidingTtl: 30 * 60 * 1000,
        maxSize: 200,
        absoluteTtl: 8 * 60 * 60 * 1000,
        bufferMs: 30 * 1000,
      },
    };

    authContext = {
      mode: AuthMode.Delegated,
      userObjectId: "test-user-id",
      tenantId: "test-tenant-id",
      accessToken: "test-access-token",
      expiresAt: Date.now() + 3600000,
    };

    manager = new CredentialManager(
      applicationConfig,
      delegatedConfig,
      clientManagerConfig,
    );
  });

  describe("getDelegatedCredential", () => {
    it("should use shorter TTL when token expires soon", async () => {
      const fixedNow = 1000000000000; // Fixed timestamp
      const dateNowSpy = spyOn(Date, "now").mockReturnValue(fixedNow);

      const shortLivedContext: TokenBasedAuthContext = {
        ...authContext,
        expiresAt: fixedNow + 60 * 1000,
      };

      const mockCache = spyOn(
        manager["delegatedCredentialCache"],
        "getOrCreate",
      );
      mockCache.mockResolvedValue(MockTokenCredential() as any);

      await manager.getDelegatedCredential(shortLivedContext);

      expect(mockCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          authType: CredentialType.Delegated,
          userObjectId: "test-user-id",
          tenantId: "test-tenant-id",
        }),
        30000,
      );

      dateNowSpy.mockRestore();
    });

    it("should use default TTL when token has long lifetime", async () => {
      const fixedNow = 1000000000000; // Fixed timestamp
      const dateNowSpy = spyOn(Date, "now").mockReturnValue(fixedNow);

      const longLivedContext: TokenBasedAuthContext = {
        ...authContext,
        expiresAt: fixedNow + 2 * 60 * 60 * 1000,
      };

      const mockCache = spyOn(
        manager["delegatedCredentialCache"],
        "getOrCreate",
      );
      mockCache.mockResolvedValue(MockTokenCredential() as any);

      await manager.getDelegatedCredential(longLivedContext);

      expect(mockCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          authType: CredentialType.Delegated,
          userObjectId: "test-user-id",
          tenantId: "test-tenant-id",
        }),
        30 * 60 * 1000,
      );

      dateNowSpy.mockRestore();
    });

    it("should not cache credential when token expires within buffer time", async () => {
      const fixedNow = 1000000000000; // Fixed timestamp
      const dateNowSpy = spyOn(Date, "now").mockReturnValue(fixedNow);

      const soonExpiredContext: TokenBasedAuthContext = {
        ...authContext,
        expiresAt: fixedNow + 20 * 1000,
      };

      const mockFactory = spyOn(
        manager["credentialFactory"],
        "createDelegatedCredential",
      );
      const mockCache = spyOn(
        manager["delegatedCredentialCache"],
        "getOrCreate",
      );
      mockFactory.mockReturnValue(MockTokenCredential() as any);

      await manager.getDelegatedCredential(soonExpiredContext);

      expect(mockFactory).toHaveBeenCalledWith(soonExpiredContext);
      expect(mockCache).not.toHaveBeenCalled();

      dateNowSpy.mockRestore();
    });

    it("should not cache credential when token expires exactly at buffer time", async () => {
      const fixedNow = 1000000000000; // Fixed timestamp
      const dateNowSpy = spyOn(Date, "now").mockReturnValue(fixedNow);

      const bufferExpiredContext: TokenBasedAuthContext = {
        ...authContext,
        expiresAt: fixedNow + 30 * 1000,
      };

      const mockFactory = spyOn(
        manager["credentialFactory"],
        "createDelegatedCredential",
      );
      const mockCache = spyOn(
        manager["delegatedCredentialCache"],
        "getOrCreate",
      );
      mockFactory.mockReturnValue(MockTokenCredential() as any);

      await manager.getDelegatedCredential(bufferExpiredContext);

      expect(mockFactory).toHaveBeenCalledWith(bufferExpiredContext);
      expect(mockCache).not.toHaveBeenCalled();

      dateNowSpy.mockRestore();
    });
  });
});
