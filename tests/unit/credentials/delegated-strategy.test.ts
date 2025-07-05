import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DelegatedCredentialStrategy } from "../../../src/credentials/delegated-strategy.js";
import { type DelegatedAuthConfig } from "../../../src/config/configuration.js";
import { type TokenBasedAuthContext } from "../../../src/auth/context.js";
import { AuthMode } from "../../../src/types.js";

// Mock the Azure SDK
const MockOnBehalfOfCredential = mock(function (options: any) {
  return { mockType: "OnBehalfOfCredential", options };
});

mock.module("@azure/identity", () => ({
  OnBehalfOfCredential: MockOnBehalfOfCredential,
}));

mock.module("../../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

describe("DelegatedCredentialStrategy", () => {
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

  describe("Client Secret Authentication", () => {
    it("should create OBO credential with client secret", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-client-secret",
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(authContext);

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("OnBehalfOfCredential");

      const options = (credential as any).options;
      expect(options.tenantId).toBe("test-tenant-id");
      expect(options.clientId).toBe("test-client-id");
      expect(options.clientSecret).toBe("test-client-secret");
      expect(options.userAssertionToken).toBe("test-access-token");
    });

    it("should use tenant from auth context instead of config", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "config-tenant-id",
        clientSecret: "test-client-secret",
      };

      const contextWithDifferentTenant: TokenBasedAuthContext = {
        ...authContext,
        tenantId: "context-tenant-id",
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(
        contextWithDifferentTenant,
      );

      const options = (credential as any).options;
      expect(options.tenantId).toBe("context-tenant-id");
    });
  });

  describe("Certificate Authentication", () => {
    it("should create OBO credential with certificate", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "/path/to/cert.pem",
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(authContext);

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("OnBehalfOfCredential");

      const options = (credential as any).options;
      expect(options.tenantId).toBe("test-tenant-id");
      expect(options.clientId).toBe("test-client-id");
      expect(options.certificatePath).toBe("/path/to/cert.pem");
      expect(options.userAssertionToken).toBe("test-access-token");
      expect(options.clientSecret).toBeUndefined();
    });

    it("should create OBO credential with certificate and password", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "/path/to/cert.pem",
        certificatePassword: "cert-password",
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(authContext);

      expect(credential).toBeDefined();

      const options = (credential as any).options;
      expect(options.certificatePath).toBe("/path/to/cert.pem");
      expect(options.userAssertionToken).toBe("test-access-token");
    });
  });

  describe("Constructor Validation", () => {
    it("should throw error when neither secret nor certificate is provided", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
      };

      expect(() => new DelegatedCredentialStrategy(config)).toThrow(
        "Azure authentication requires either client certificate path or client secret",
      );
    });

    it("should throw error when both secret and certificate are provided", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-secret",
        certificatePath: "/path/to/cert.pem",
      };

      expect(() => new DelegatedCredentialStrategy(config)).toThrow(
        "Only one of certificatePath or clientSecret should be provided",
      );
    });

    it("should accept valid client secret configuration", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-secret",
      };

      expect(() => new DelegatedCredentialStrategy(config)).not.toThrow();
    });

    it("should accept valid certificate configuration", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "/path/to/cert.pem",
      };

      expect(() => new DelegatedCredentialStrategy(config)).not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty certificate path", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "",
        clientSecret: "test-secret",
      };

      // Empty certificate path should be treated as undefined
      expect(() => new DelegatedCredentialStrategy(config)).not.toThrow();
    });

    it("should handle empty client secret", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "",
        certificatePath: "/path/to/cert.pem",
      };

      // Empty client secret should be treated as undefined
      expect(() => new DelegatedCredentialStrategy(config)).not.toThrow();
    });

    it("should handle undefined certificate password", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "/path/to/cert.pem",
        certificatePassword: undefined,
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(authContext);

      expect(credential).toBeDefined();
    });
  });

  describe("Token Context Handling", () => {
    it("should properly use access token from context", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-secret",
      };

      const contextWithCustomToken: TokenBasedAuthContext = {
        ...authContext,
        accessToken: "custom-access-token",
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(contextWithCustomToken);

      const options = (credential as any).options;
      expect(options.userAssertionToken).toBe("custom-access-token");
    });

    it("should use all required context fields", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "config-tenant-id",
        clientSecret: "test-secret",
      };

      const customContext: TokenBasedAuthContext = {
        mode: AuthMode.Composite,
        userObjectId: "custom-user-id",
        tenantId: "custom-tenant-id",
        accessToken: "custom-access-token",
        expiresAt: Date.now() + 7200000,
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(customContext);

      const options = (credential as any).options;
      expect(options.tenantId).toBe("custom-tenant-id");
      expect(options.clientId).toBe("test-client-id");
      expect(options.userAssertionToken).toBe("custom-access-token");
    });
  });
});
