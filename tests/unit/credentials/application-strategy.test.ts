import { describe, it, expect, beforeEach, mock } from "bun:test";
import { ApplicationCredentialStrategy } from "../../../src/credentials/application-strategy.js";
import { type ApplicationAuthConfig } from "../../../src/config/configuration.js";
import { ApplicationAuthStrategy } from "../../../src/types.js";

// Mock the Azure SDK
const MockAzureCliCredential = mock(function () {
  return { mockType: "AzureCliCredential" };
});
const MockManagedIdentityCredential = mock(function (options?: any) {
  return { mockType: "ManagedIdentityCredential", options };
});
const MockChainedTokenCredential = mock(function (...credentials: any[]) {
  return { mockType: "ChainedTokenCredential", credentials };
});

mock.module("@azure/identity", () => ({
  AzureCliCredential: MockAzureCliCredential,
  ManagedIdentityCredential: MockManagedIdentityCredential,
  ChainedTokenCredential: MockChainedTokenCredential,
}));

mock.module("../../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

describe("ApplicationCredentialStrategy", () => {
  describe("CLI Strategy", () => {
    it("should create Azure CLI credential", () => {
      const config: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.Cli,
      };

      const strategy = new ApplicationCredentialStrategy(config);
      const credential = strategy.createCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("AzureCliCredential");
      expect(MockAzureCliCredential).toHaveBeenCalledTimes(1);
    });
  });

  describe("Managed Identity Strategy", () => {
    it("should create managed identity credential without client ID", () => {
      const config: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.ManagedIdentity,
      };

      const strategy = new ApplicationCredentialStrategy(config);
      const credential = strategy.createCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("ManagedIdentityCredential");
      expect((credential as any).options).toBeUndefined();
      expect(MockManagedIdentityCredential).toHaveBeenCalledWith(undefined);
    });

    it("should create managed identity credential with client ID", () => {
      const config: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.ManagedIdentity,
        managedIdentityClientId: "test-mi-client-id",
      };

      const strategy = new ApplicationCredentialStrategy(config);
      const credential = strategy.createCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("ManagedIdentityCredential");
      expect((credential as any).options).toEqual({
        clientId: "test-mi-client-id",
      });
      expect(MockManagedIdentityCredential).toHaveBeenCalledWith({
        clientId: "test-mi-client-id",
      });
    });
  });

  describe("Chain Strategy", () => {
    it("should create chained credential without managed identity client ID", () => {
      const config: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.Chain,
      };

      const strategy = new ApplicationCredentialStrategy(config);
      const credential = strategy.createCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("ChainedTokenCredential");
      expect((credential as any).credentials).toHaveLength(2);

      // Verify the order: CLI first, then Managed Identity
      expect((credential as any).credentials[0].mockType).toBe(
        "AzureCliCredential",
      );
      expect((credential as any).credentials[1].mockType).toBe(
        "ManagedIdentityCredential",
      );
      expect((credential as any).credentials[1].options).toBeUndefined();
    });

    it("should create chained credential with managed identity client ID", () => {
      const config: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.Chain,
        managedIdentityClientId: "test-mi-client-id",
      };

      const strategy = new ApplicationCredentialStrategy(config);
      const credential = strategy.createCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("ChainedTokenCredential");
      expect((credential as any).credentials).toHaveLength(2);

      // Verify the order and managed identity configuration
      expect((credential as any).credentials[0].mockType).toBe(
        "AzureCliCredential",
      );
      expect((credential as any).credentials[1].mockType).toBe(
        "ManagedIdentityCredential",
      );
      expect((credential as any).credentials[1].options).toEqual({
        clientId: "test-mi-client-id",
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw error for unsupported strategy", () => {
      const config: ApplicationAuthConfig = {
        strategy: "unsupported-strategy" as any,
      };

      const strategy = new ApplicationCredentialStrategy(config);

      expect(() => strategy.createCredential()).toThrow(
        "Unsupported application strategy: unsupported-strategy",
      );
    });
  });

  describe("Configuration Validation", () => {
    it("should handle missing managedIdentityClientId gracefully", () => {
      const config: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.ManagedIdentity,
        managedIdentityClientId: undefined,
      };

      const strategy = new ApplicationCredentialStrategy(config);
      const credential = strategy.createCredential();

      expect(credential).toBeDefined();
      expect(MockManagedIdentityCredential).toHaveBeenCalledWith(undefined);
    });

    it("should handle empty managedIdentityClientId gracefully", () => {
      const config: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.ManagedIdentity,
        managedIdentityClientId: "",
      };

      const strategy = new ApplicationCredentialStrategy(config);
      const credential = strategy.createCredential();

      expect(credential).toBeDefined();
      // Empty string should be treated as falsy
      expect(MockManagedIdentityCredential).toHaveBeenCalledWith(undefined);
    });
  });
});
