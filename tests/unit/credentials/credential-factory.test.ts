import { describe, it, expect, beforeEach, mock } from "bun:test";
import { CredentialFactory } from "../../../src/credentials/credential-factory.js";
import {
  type ApplicationAuthConfig,
  type DelegatedAuthConfig,
} from "../../../src/config/configuration.js";
import { type TokenBasedAuthContext } from "../../../src/auth/context.js";
import { ApplicationAuthStrategy, AuthMode } from "../../../src/types.js";

// Mock the Azure SDK
mock.module("@azure/identity", () => ({
  AzureCliCredential: mock(function () {
    return { mockType: "AzureCliCredential" };
  }),
  ManagedIdentityCredential: mock(function (options?: any) {
    return { mockType: "ManagedIdentityCredential", options };
  }),
  ChainedTokenCredential: mock(function (...credentials: any[]) {
    return { mockType: "ChainedTokenCredential", credentials };
  }),
  OnBehalfOfCredential: mock(function (options: any) {
    return { mockType: "OnBehalfOfCredential", options };
  }),
}));

mock.module("../../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

describe("CredentialFactory", () => {
  let applicationConfig: ApplicationAuthConfig;
  let delegatedConfig: DelegatedAuthConfig;
  let credentialFactory: CredentialFactory;

  beforeEach(async () => {
    applicationConfig = {
      strategy: ApplicationAuthStrategy.Chain,
      managedIdentityClientId: "test-managed-identity-client",
    };

    delegatedConfig = {
      clientId: "test-client-id",
      tenantId: "test-tenant-id",
      clientSecret: "test-client-secret",
    };

    credentialFactory = await CredentialFactory.create(
      applicationConfig,
      delegatedConfig,
    );
  });

  describe("Constructor", () => {
    it("should create credential factory with valid configurations", () => {
      expect(credentialFactory).toBeDefined();
      expect(credentialFactory.createApplicationCredential).toBeFunction();
      expect(credentialFactory.createDelegatedCredential).toBeFunction();
    });

    it("should handle application config without managed identity client ID", async () => {
      const configWithoutMI: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.Cli,
      };

      const factory = await CredentialFactory.create(
        configWithoutMI,
        delegatedConfig,
      );

      expect(factory).toBeDefined();
    });
  });

  describe("createApplicationCredential", () => {
    it("should create application credential using chain strategy", () => {
      const credential = credentialFactory.createApplicationCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("ChainedTokenCredential");
    });

    it("should create CLI credential when strategy is CLI", async () => {
      const cliConfig: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.Cli,
      };

      const factory = await CredentialFactory.create(
        cliConfig,
        delegatedConfig,
      );
      const credential = factory.createApplicationCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("AzureCliCredential");
    });

    it("should create managed identity credential when strategy is ManagedIdentity", async () => {
      const miConfig: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.ManagedIdentity,
        managedIdentityClientId: "mi-client-id",
      };

      const factory = await CredentialFactory.create(miConfig, delegatedConfig);
      const credential = factory.createApplicationCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("ManagedIdentityCredential");
      expect((credential as any).options).toEqual({ clientId: "mi-client-id" });
    });

    it("should create managed identity credential without client ID when not provided", async () => {
      const miConfig: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.ManagedIdentity,
      };

      const factory = await CredentialFactory.create(miConfig, delegatedConfig);
      const credential = factory.createApplicationCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("ManagedIdentityCredential");
      expect((credential as any).options).toBeUndefined();
    });
  });

  describe("createDelegatedCredential", () => {
    let authContext: TokenBasedAuthContext;

    beforeEach(() => {
      authContext = {
        mode: AuthMode.Delegated,
        userObjectId: "test-user-id",
        tenantId: "test-tenant-id",
        accessToken: "test-access-token",
        expiresAt: Date.now() + 3600000,
      };
    });

    it("should create delegated credential with client secret", () => {
      const credential =
        credentialFactory.createDelegatedCredential(authContext);

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("OnBehalfOfCredential");

      const options = (credential as any).options;
      expect(options.tenantId).toBe("test-tenant-id");
      expect(options.clientId).toBe("test-client-id");
      expect(options.clientSecret).toBe("test-client-secret");
      expect(options.userAssertionToken).toBe("test-access-token");
    });

    it("should create delegated credential with certificate", async () => {
      const certConfig: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "/path/to/cert.pem",
      };

      const factory = await CredentialFactory.create(
        applicationConfig,
        certConfig,
      );
      const credential = factory.createDelegatedCredential(authContext);

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("OnBehalfOfCredential");

      const options = (credential as any).options;
      expect(options.tenantId).toBe("test-tenant-id");
      expect(options.clientId).toBe("test-client-id");
      expect(options.certificatePath).toBe("/path/to/cert.pem");
      expect(options.userAssertionToken).toBe("test-access-token");
    });

    it("should use tenant ID from auth context", () => {
      const contextWithDifferentTenant: TokenBasedAuthContext = {
        ...authContext,
        tenantId: "different-tenant-id",
      };

      const credential = credentialFactory.createDelegatedCredential(
        contextWithDifferentTenant,
      );

      const options = (credential as any).options;
      expect(options.tenantId).toBe("different-tenant-id");
    });
  });

  describe("Error Handling", () => {
    it("should throw error when delegated config is not provided", async () => {
      // Factory creation should not throw when no delegated config is provided
      const factory = await CredentialFactory.create(applicationConfig);
      expect(factory).toBeDefined();

      // But creating delegated credential should throw
      const authContext: TokenBasedAuthContext = {
        mode: AuthMode.Delegated,
        userObjectId: "test-user-id",
        tenantId: "test-tenant-id",
        accessToken: "test-access-token",
        expiresAt: Date.now() + 3600000,
      };

      expect(() => factory.createDelegatedCredential(authContext)).toThrow(
        "Delegated authentication not configured. Please provide delegated auth configuration with: clientId, tenantId, and either clientSecret OR certificate configuration (certificatePath/certificatePem).",
      );
    });

    it("should throw error when creating delegated credential with incomplete config", async () => {
      const incompleteConfig: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        // No clientSecret or certificate provided
      };

      // Factory creation should not throw
      const factory = await CredentialFactory.create(
        applicationConfig,
        incompleteConfig,
      );
      expect(factory).toBeDefined();

      // But creating delegated credential should throw because no clientSecret or certificate
      const authContext: TokenBasedAuthContext = {
        mode: AuthMode.Delegated,
        userObjectId: "test-user-id",
        tenantId: "test-tenant-id",
        accessToken: "test-access-token",
        expiresAt: Date.now() + 3600000,
      };

      expect(() => factory.createDelegatedCredential(authContext)).toThrow(
        "Client secret is required for secret-based authentication",
      );
    });

    it("should throw error for unsupported application strategy", async () => {
      const invalidConfig: ApplicationAuthConfig = {
        strategy: "unsupported" as any,
      };

      const factory = await CredentialFactory.create(
        invalidConfig,
        delegatedConfig,
      );

      expect(() => factory.createApplicationCredential()).toThrow(
        "Unsupported application strategy: unsupported",
      );
    });
  });
});
