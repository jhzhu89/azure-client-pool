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

  beforeEach(() => {
    applicationConfig = {
      strategy: ApplicationAuthStrategy.Chain,
      managedIdentityClientId: "test-managed-identity-client",
    };

    delegatedConfig = {
      clientId: "test-client-id",
      tenantId: "test-tenant-id",
      clientSecret: "test-client-secret",
    };

    credentialFactory = new CredentialFactory(
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

    it("should handle application config without managed identity client ID", () => {
      const configWithoutMI: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.Cli,
      };

      const factory = new CredentialFactory(configWithoutMI, delegatedConfig);

      expect(factory).toBeDefined();
    });
  });

  describe("createApplicationCredential", () => {
    it("should create application credential using chain strategy", () => {
      const credential = credentialFactory.createApplicationCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("ChainedTokenCredential");
    });

    it("should create CLI credential when strategy is CLI", () => {
      const cliConfig: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.Cli,
      };

      const factory = new CredentialFactory(cliConfig, delegatedConfig);
      const credential = factory.createApplicationCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("AzureCliCredential");
    });

    it("should create managed identity credential when strategy is ManagedIdentity", () => {
      const miConfig: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.ManagedIdentity,
        managedIdentityClientId: "mi-client-id",
      };

      const factory = new CredentialFactory(miConfig, delegatedConfig);
      const credential = factory.createApplicationCredential();

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("ManagedIdentityCredential");
      expect((credential as any).options).toEqual({ clientId: "mi-client-id" });
    });

    it("should create managed identity credential without client ID when not provided", () => {
      const miConfig: ApplicationAuthConfig = {
        strategy: ApplicationAuthStrategy.ManagedIdentity,
      };

      const factory = new CredentialFactory(miConfig, delegatedConfig);
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

    it("should create delegated credential with certificate", () => {
      const certConfig: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "/path/to/cert.pem",
        certificatePassword: "cert-password",
      };

      const factory = new CredentialFactory(applicationConfig, certConfig);
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
    it("should throw error for delegated config with both secret and certificate", () => {
      const invalidConfig: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-secret",
        certificatePath: "/path/to/cert.pem",
      };

      expect(
        () => new CredentialFactory(applicationConfig, invalidConfig),
      ).toThrow(
        "Only one of certificatePath or clientSecret should be provided",
      );
    });

    it("should throw error for delegated config with neither secret nor certificate", () => {
      const invalidConfig: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
      };

      expect(
        () => new CredentialFactory(applicationConfig, invalidConfig),
      ).toThrow(
        "Azure authentication requires either client certificate path or client secret",
      );
    });

    it("should throw error for unsupported application strategy", () => {
      const invalidConfig: ApplicationAuthConfig = {
        strategy: "unsupported" as any,
      };

      const factory = new CredentialFactory(invalidConfig, delegatedConfig);

      expect(() => factory.createApplicationCredential()).toThrow(
        "Unsupported application strategy: unsupported",
      );
    });
  });
});
