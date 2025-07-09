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
        bufferMs: 30 * 1000,
      },
      credentialCache: {
        slidingTtl: 30 * 60 * 1000,
        maxSize: 200,
        absoluteTtl: 8 * 60 * 60 * 1000,
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
    it("should always create a new delegated credential", async () => {
      const mockFactory = spyOn(
        manager["credentialFactory"],
        "createDelegatedCredential",
      );
      const mockCredential = MockTokenCredential() as any;
      mockFactory.mockReturnValue(mockCredential);

      const result = await manager.getDelegatedCredential(authContext);

      expect(mockFactory).toHaveBeenCalledWith(authContext);
      expect(result).toBe(mockCredential);
    });

    it("should create new credential instances for each call", async () => {
      const mockFactory = spyOn(
        manager["credentialFactory"],
        "createDelegatedCredential",
      );
      const mockCredential = MockTokenCredential() as any;
      mockFactory.mockReturnValue(mockCredential);

      const result1 = await manager.getDelegatedCredential(authContext);
      const result2 = await manager.getDelegatedCredential(authContext);

      expect(mockFactory).toHaveBeenCalledTimes(2);
      expect(result1).toBe(mockCredential);
      expect(result2).toBe(mockCredential);
    });

    it("should pass different auth contexts to credential factory", async () => {
      const mockFactory = spyOn(
        manager["credentialFactory"],
        "createDelegatedCredential",
      );
      const mockCredential = MockTokenCredential() as any;
      mockFactory.mockReturnValue(mockCredential);

      const context1 = { ...authContext, userObjectId: "user-1" };
      const context2 = { ...authContext, userObjectId: "user-2" };

      await manager.getDelegatedCredential(context1);
      await manager.getDelegatedCredential(context2);

      expect(mockFactory).toHaveBeenCalledWith(context1);
      expect(mockFactory).toHaveBeenCalledWith(context2);
      expect(mockFactory).toHaveBeenCalledTimes(2);
    });
  });
});
