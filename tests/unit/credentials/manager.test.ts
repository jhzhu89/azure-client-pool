import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { CredentialManager } from "../../../src/credentials/manager.js";
import {
  AuthMode,
  CredentialType,
  type AuthRequest,
} from "../../../src/types.js";
import {
  type ClientManagerConfig,
  type ApplicationAuthConfig,
  type DelegatedAuthConfig,
} from "../../../src/config/configuration.js";
import { Identity } from "@jhzhu89/jwt-validator";

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
  let delegatedAuthRequest: AuthRequest;

  beforeEach(async () => {
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

    const identity = new Identity("test-access-token", {
      oid: "test-user-id",
      tid: "test-tenant-id",
      exp: Math.floor((Date.now() + 3600000) / 1000),
    });

    delegatedAuthRequest = {
      mode: AuthMode.Delegated,
      identity,
    };

    manager = await CredentialManager.create(
      applicationConfig,
      clientManagerConfig,
      delegatedConfig,
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

      const result = await manager.getDelegatedCredential(delegatedAuthRequest);

      expect(mockFactory).toHaveBeenCalledWith(delegatedAuthRequest);
      expect(result).toBe(mockCredential);
    });

    it("should create new credential instances for each call", async () => {
      const mockFactory = spyOn(
        manager["credentialFactory"],
        "createDelegatedCredential",
      );
      const mockCredential = MockTokenCredential() as any;
      mockFactory.mockReturnValue(mockCredential);

      const result1 =
        await manager.getDelegatedCredential(delegatedAuthRequest);
      const result2 =
        await manager.getDelegatedCredential(delegatedAuthRequest);

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

      const identity1 = new Identity("token1", {
        oid: "user-1",
        tid: "test-tenant-id",
        exp: Math.floor((Date.now() + 3600000) / 1000),
      });

      const identity2 = new Identity("token2", {
        oid: "user-2",
        tid: "test-tenant-id",
        exp: Math.floor((Date.now() + 3600000) / 1000),
      });

      const context1: AuthRequest = {
        mode: AuthMode.Delegated,
        identity: identity1,
      };
      const context2: AuthRequest = {
        mode: AuthMode.Delegated,
        identity: identity2,
      };

      await manager.getDelegatedCredential(context1);
      await manager.getDelegatedCredential(context2);

      expect(mockFactory).toHaveBeenCalledWith(context1);
      expect(mockFactory).toHaveBeenCalledWith(context2);
      expect(mockFactory).toHaveBeenCalledTimes(2);
    });
  });
});
