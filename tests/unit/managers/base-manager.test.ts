import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { BaseClientManager } from "../../../src/managers/base-manager.js";
import {
  createMockTokenCredential,
  createMockClientFactory,
  sleep,
  setupLoggingMock,
} from "../../utils/test-helpers.js";
import {
  mockClientConfigs,
  createMockAuthContexts,
} from "../../fixtures/mock-data.js";

class TestClientManager extends BaseClientManager<any, any, any> {
  constructor(provider: any, clientFactory: any, config: any) {
    super(provider, clientFactory, config);
  }

  protected getAuthMode(): string {
    return "test";
  }

  protected getCredentialCacheKeyComponents(context: any): string[] {
    return context.mode === "delegated"
      ? [context.tenantId, context.userObjectId]
      : [];
  }

  protected createClientCacheKey(context: any, options?: any): string {
    const parts = [this.config.cacheKeyPrefix, context.mode];
    if (context.mode === "delegated") {
      parts.push(context.tenantId, context.userObjectId);
    }
    if (options?.endpoint) {
      parts.push(options.endpoint);
    }
    return parts.join("::");
  }

  protected getLoggingContext(context: any): Record<string, unknown> {
    return context.mode === "delegated"
      ? { tenantId: context.tenantId, userObjectId: context.userObjectId }
      : {};
  }
}

describe("BaseClientManager", () => {
  let mockProvider: any;
  let mockClientFactory: any;
  let manager: TestClientManager;
  let mockAuthContexts: any;

  beforeEach(() => {
    setupLoggingMock();
    mockProvider = {
      createCredential: mock(async () => createMockTokenCredential()),
    };
    mockClientFactory = createMockClientFactory();
    manager = new TestClientManager(
      mockProvider,
      mockClientFactory,
      mockClientConfigs.application,
    );
    mockAuthContexts = createMockAuthContexts();
  });

  afterEach(() => {
    manager.clearCache();
  });

  describe("Caching", () => {
    it("should cache clients and return same instance on subsequent calls", async () => {
      const context = mockAuthContexts.application;

      const client1 = await manager.getClient(context);
      const client2 = await manager.getClient(context);

      expect(client1).toBe(client2);
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(1);
    });

    it("should create separate cache entries for different contexts", async () => {
      const client1 = await manager.getClient(mockAuthContexts.application);
      const client2 = await manager.getClient(mockAuthContexts.delegated);

      expect(client1).not.toBe(client2);
      expect(mockClientFactory.createClient).toHaveBeenCalledTimes(2);
    });

    it("should cache credentials and reuse them", async () => {
      const context = mockAuthContexts.application;

      await manager.getClient(context);
      await manager.getClient(context);

      expect(mockProvider.createCredential).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle credential creation errors", async () => {
      mockProvider.createCredential.mockRejectedValueOnce(
        new Error("Credential creation failed"),
      );

      await expect(
        manager.getClient(mockAuthContexts.application),
      ).rejects.toThrow("Credential creation failed");
    });

    it("should handle client creation errors", async () => {
      mockClientFactory.createClient.mockRejectedValueOnce(
        new Error("Client creation failed"),
      );

      await expect(
        manager.getClient(mockAuthContexts.application),
      ).rejects.toThrow("Client creation failed");
    });
  });
});
