import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createClientProvider } from "../../src/client-pool/provider.js";
import {
  type ClientFactory,
  AuthMode,
  type CredentialProvider,
  CredentialType,
} from "../../src/types.js";
import {
  delegatedModeWithSecretEnv,
  applicationModeEnv,
} from "../fixtures/environment.js";

// Mock Azure identity
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

// Mock JWT validation
mock.module("jsonwebtoken", () => ({
  default: {
    verify: mock((token: string, getKey: any, options: any, callback: any) => {
      if (token === "invalid-token") {
        return callback(new Error("Invalid token"));
      }
      callback(null, {
        oid: "test-user-id",
        tid: "test-tenant-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
    }),
  },
}));

mock.module("jwks-rsa", () => ({
  default: mock((options: any) => ({
    getSigningKey: mock((kid: string, callback: any) => {
      callback(null, {
        getPublicKey: () => "mock-public-key",
      });
    }),
  })),
}));

mock.module("../../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

// Mock client for testing
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
        // Add required delegated config even for application mode tests
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

      const client = await provider.getClient({
        mode: AuthMode.Application,
      });

      expect(client).toBeDefined();
      expect(client.type).toBe("mock-client");
      expect(client.credentialProvider).toBeDefined();
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });

    it("should cache clients for same authentication context", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const client1 = await provider.getClient({
        mode: AuthMode.Application,
      });

      const client2 = await provider.getClient({
        mode: AuthMode.Application,
      });

      expect(client1).toBe(client2);
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });

    it("should invalidate client cache", async () => {
      const provider = await createClientProvider(mockClientFactory);

      // Get client first
      await provider.getClient({
        mode: AuthMode.Application,
      });

      // Invalidate cache
      const invalidated = await provider.invalidateClientCache({
        mode: AuthMode.Application,
      });

      expect(invalidated).toBe(true);

      // Getting client again should create new instance
      await provider.getClient({
        mode: AuthMode.Application,
      });

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

      const client = await provider.getClient({
        mode: AuthMode.Delegated,
        accessToken: "valid-jwt-token",
      });

      expect(client).toBeDefined();
      expect(client.type).toBe("mock-client");
      expect(client.credentialProvider).toBeDefined();
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });

    it("should cache clients per user", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const client1 = await provider.getClient({
        mode: AuthMode.Delegated,
        accessToken: "valid-jwt-token",
      });

      const client2 = await provider.getClient({
        mode: AuthMode.Delegated,
        accessToken: "valid-jwt-token",
      });

      expect(client1).toBe(client2);
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });

    it("should throw error for invalid JWT token", async () => {
      const provider = await createClientProvider(mockClientFactory);

      await expect(
        provider.getClient({
          mode: AuthMode.Delegated,
          accessToken: "invalid-token",
        }),
      ).rejects.toThrow();
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      process.env = {
        ...applicationModeEnv,
        // Add required delegated config
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

      await expect(
        provider.getClient({
          mode: AuthMode.Application,
        }),
      ).rejects.toThrow("Client creation failed");
    });

    it("should handle unsupported auth modes", async () => {
      const provider = await createClientProvider(mockClientFactory);

      await expect(
        provider.getClient({
          mode: "unsupported" as any,
        }),
      ).rejects.toThrow();
    });
  });

  describe("Performance", () => {
    beforeEach(() => {
      process.env = {
        ...applicationModeEnv,
        // Add required delegated config
        AZURE_CLIENT_ID: "test-client-id",
        AZURE_TENANT_ID: "test-tenant-id",
        AZURE_CLIENT_SECRET: "test-client-secret",
      };
    });

    it("should create multiple clients efficiently", async () => {
      const provider = await createClientProvider(mockClientFactory);

      const startTime = performance.now();

      // Create clients in parallel
      await Promise.all([
        provider.getClient({ mode: AuthMode.Application }),
        provider.getClient({ mode: AuthMode.Application }),
        provider.getClient({ mode: AuthMode.Application }),
      ]);

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be very fast due to caching
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1); // Should use cache
    });
  });
});
