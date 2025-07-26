import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createClientProvider } from "../../src/client-pool/factory.js";
import {
  type ClientFactory,
  AuthMode,
  type CredentialProvider,
  CredentialType,
  type AuthRequest,
} from "../../src/types.js";
import { Identity } from "@jhzhu89/jwt-validator";
import {
  delegatedModeWithSecretEnv,
  applicationModeEnv,
} from "../fixtures/environment.js";

mock.module("@azure/identity", () => ({
  AzureCliCredential: mock(function () {
    return {
      mockType: "AzureCliCredential",
      getToken: mock(async () => ({
        token: "mock-cli-token",
        expiresOnTimestamp: Date.now() + 3600000,
      })),
    };
  }),
  ManagedIdentityCredential: mock(function (options?: any) {
    return {
      mockType: "ManagedIdentityCredential",
      getToken: mock(async () => ({
        token: "mock-mi-token",
        expiresOnTimestamp: Date.now() + 3600000,
      })),
      options,
    };
  }),
  ChainedTokenCredential: mock(function (...credentials: any[]) {
    return {
      mockType: "ChainedTokenCredential",
      getToken: mock(async () => ({
        token: "mock-chain-token",
        expiresOnTimestamp: Date.now() + 3600000,
      })),
      credentials,
    };
  }),
  OnBehalfOfCredential: mock(function (options: any) {
    return {
      mockType: "OnBehalfOfCredential",
      getToken: mock(async () => ({
        token: "mock-obo-token",
        expiresOnTimestamp: Date.now() + 3600000,
      })),
      options,
    };
  }),
}));

mock.module("../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

interface MockClient {
  id: string;
  credentialProvider: CredentialProvider;
  type: string;
}

describe("ClientProvider Integration", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockClientFactory: ClientFactory<MockClient>;

  beforeEach(() => {
    originalEnv = process.env;

    mockClientFactory = {
      createClient: mock(async (credentialProvider: CredentialProvider) => ({
        id: `client-${Date.now()}`,
        credentialProvider,
        type: "mock-client",
      })),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Application Mode", () => {
    beforeEach(() => {
      process.env = {
        ...applicationModeEnv,
        AZURE_CLIENT_ID: "test-client-id",
        AZURE_TENANT_ID: "test-tenant-id",
        AZURE_CLIENT_SECRET: "test-client-secret",
      };
    });

    it("should create client provider for application mode", async () => {
      const provider = await createClientProvider(mockClientFactory);

      expect(provider).toBeDefined();
      expect(typeof provider.getClient).toBe("function");
      expect(typeof provider.invalidateClientCache).toBe("function");
    });

    it("should get client with application authentication", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const authRequest: AuthRequest = {
        mode: AuthMode.Application,
      };

      const client = await provider.getClient(authRequest);

      expect(client).toBeDefined();
      expect(client.type).toBe("mock-client");
      expect(client.credentialProvider).toBeDefined();
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });

    it("should cache clients for same authentication context", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const authRequest: AuthRequest = {
        mode: AuthMode.Application,
      };

      const client1 = await provider.getClient(authRequest);
      const client2 = await provider.getClient(authRequest);

      expect(client1).toBe(client2);
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });

    it("should invalidate client cache", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const authRequest: AuthRequest = {
        mode: AuthMode.Application,
      };

      await provider.getClient(authRequest);

      const invalidated = await provider.invalidateClientCache(authRequest);
      expect(invalidated).toBe(true);

      await provider.getClient(authRequest);
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(2);
    });
  });

  describe("Delegated Mode", () => {
    beforeEach(() => {
      process.env = { ...delegatedModeWithSecretEnv };
    });

    it("should create client provider for delegated mode", async () => {
      const provider = await createClientProvider(mockClientFactory);
      expect(provider).toBeDefined();
    });

    it("should get client with delegated authentication", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const identity = new Identity("valid-jwt-token", {
        oid: "test-user-id",
        tid: "test-tenant-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const authRequest: AuthRequest = {
        mode: AuthMode.Delegated,
        identity,
      };

      const client = await provider.getClient(authRequest);

      expect(client).toBeDefined();
      expect(client.type).toBe("mock-client");
      expect(client.credentialProvider).toBeDefined();
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });

    it("should cache clients per user", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const identity = new Identity("valid-jwt-token", {
        oid: "test-user-id",
        tid: "test-tenant-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const authRequest: AuthRequest = {
        mode: AuthMode.Delegated,
        identity,
      };

      const client1 = await provider.getClient(authRequest);
      const client2 = await provider.getClient(authRequest);

      expect(client1).toBe(client2);
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });

    it("should throw error for expired token", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const identity = new Identity("expired-token", {
        oid: "test-user-id",
        tid: "test-tenant-id",
        exp: Math.floor(Date.now() / 1000) - 3600,
      });

      const authRequest: AuthRequest = {
        mode: AuthMode.Delegated,
        identity,
      };

      await expect(provider.getClient(authRequest)).rejects.toThrow(
        "Token has already expired",
      );
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      process.env = {
        ...applicationModeEnv,
        AZURE_CLIENT_ID: "test-client-id",
        AZURE_TENANT_ID: "test-tenant-id",
        AZURE_CLIENT_SECRET: "test-client-secret",
      };
    });

    it("should handle client factory errors", async () => {
      const failingFactory: ClientFactory<MockClient> = {
        createClient: mock(async () => {
          throw new Error("Client creation failed");
        }),
      };

      const provider = await createClientProvider(failingFactory);

      const authRequest: AuthRequest = {
        mode: AuthMode.Application,
      };

      await expect(provider.getClient(authRequest)).rejects.toThrow(
        "Client creation failed",
      );
    });

    it("should validate required fields for delegated mode", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const identityWithoutTenant = new Identity("valid-token", {
        oid: "test-user-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const authRequest: AuthRequest = {
        mode: AuthMode.Delegated,
        identity: identityWithoutTenant,
      };

      await expect(provider.getClient(authRequest)).rejects.toThrow(
        "tenantId is required",
      );
    });
  });

  describe("Performance", () => {
    beforeEach(() => {
      process.env = {
        ...applicationModeEnv,
        AZURE_CLIENT_ID: "test-client-id",
        AZURE_TENANT_ID: "test-tenant-id",
        AZURE_CLIENT_SECRET: "test-client-secret",
      };
    });

    it("should create multiple clients efficiently", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const authRequest: AuthRequest = {
        mode: AuthMode.Application,
      };

      const startTime = performance.now();

      await Promise.all([
        provider.getClient(authRequest),
        provider.getClient(authRequest),
        provider.getClient(authRequest),
      ]);

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100);
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });
  });
});
