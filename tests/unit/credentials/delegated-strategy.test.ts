import { describe, it, expect, beforeEach, mock, afterEach } from "bun:test";
import { DelegatedCredentialStrategy } from "../../../src/credentials/delegated-strategy.js";
import { type DelegatedAuthConfig } from "../../../src/config/configuration.js";
import { type TokenBasedAuthContext } from "../../../src/auth/context.js";
import { AuthMode } from "../../../src/types.js";

// Mock the Azure SDK
const MockOnBehalfOfCredential = mock(function (options: any) {
  return { mockType: "OnBehalfOfCredential", options };
});

// Mock file system operations
const mockFs = {
  writeFileSync: mock(() => {}),
  renameSync: mock(() => {}),
  existsSync: mock(() => false),
  readFileSync: mock(() => ""),
};

const mockCrypto = {
  createHash: mock(() => ({
    update: mock(() => ({
      digest: mock(() => ({
        substring: mock(() => "mockedhash1234"),
      })),
    })),
  })),
};

mock.module("@azure/identity", () => ({
  OnBehalfOfCredential: MockOnBehalfOfCredential,
}));

mock.module("fs", () => mockFs);

mock.module("crypto", () => mockCrypto);

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

    // Reset all mocks before each test
    mockFs.writeFileSync.mockClear();
    mockFs.renameSync.mockClear();
    mockFs.existsSync.mockClear();
    mockFs.readFileSync.mockClear();
    mockCrypto.createHash.mockClear();
    MockOnBehalfOfCredential.mockClear();
  });

  afterEach(() => {
    // Reset mock implementations to default
    mockFs.existsSync.mockImplementation(() => false);
    mockFs.readFileSync.mockImplementation(() => "");
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
      expect(options.sendCertificateChain).toBe(true);
      expect(options.clientSecret).toBeUndefined();
    });
  });

  describe("Certificate PEM Authentication", () => {
    const testCertificatePem = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJANGKGVR6WYDRMAoGCCqGSM49BAMCMBQxEjAQBgNVBAMMCWxvY2Fs
aG9zdDAeFw0yMzEwMTAwMDAwMDBaFw0yNDEwMDkwMDAwMDBaMBQxEjAQBgNVBAMM
CWxvY2FsaG9zdDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABFVrWV6xXP7X3sJK
XnGlGV6y8z3ZY2VQ5P9q6r1z8a5M2g6YZ3O7D6l8y2J5v1H8c3E9q4n5r2w3u6x
7s8t9N0owCgYIKoZIzj0EAwIDSAAwRQIhALG+XvP5q4Y1K9G2D6h3N4S5z2L8p6s
9v1c8x2y3q4z5r6M5n1h9l8s6d3y2v1K9C4L8
-----END CERTIFICATE-----`;

    it("should create OBO credential with certificate PEM content", () => {
      mockFs.existsSync.mockReturnValue(false);

      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePem: testCertificatePem,
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(authContext);

      expect(credential).toBeDefined();
      expect((credential as any).mockType).toBe("OnBehalfOfCredential");

      const options = (credential as any).options;
      expect(options.tenantId).toBe("test-tenant-id");
      expect(options.clientId).toBe("test-client-id");
      expect(options.userAssertionToken).toBe("test-access-token");
      expect(options.sendCertificateChain).toBe(true);
      expect(options.clientSecret).toBeUndefined();

      // Should create temporary certificate file
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(mockFs.renameSync).toHaveBeenCalledTimes(1);

      const certificatePath = options.certificatePath;
      expect(certificatePath).toMatch(
        /\/dev\/shm\/azure-cert-mockedhash1234-\d+\.pem/,
      );
    });

    it("should reuse existing certificate file if content matches", () => {
      // Mock existing file with matching content
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(testCertificatePem);

      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePem: testCertificatePem,
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(authContext);

      expect(credential).toBeDefined();

      // Should not create new file since existing one matches
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      expect(mockFs.renameSync).not.toHaveBeenCalled();

      const options = (credential as any).options;
      const certificatePath = options.certificatePath;
      expect(certificatePath).toMatch(
        /\/dev\/shm\/azure-cert-mockedhash1234-\d+\.pem/,
      );
    });

    it("should recreate certificate file if content differs", () => {
      // Mock existing file with different content
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue("different certificate content");

      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePem: testCertificatePem,
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(authContext);

      expect(credential).toBeDefined();

      // Should create new file since existing one doesn't match
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(mockFs.renameSync).toHaveBeenCalledTimes(1);
    });

    it("should handle file read errors gracefully", () => {
      // Mock existing file but reading throws error
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePem: testCertificatePem,
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(authContext);

      expect(credential).toBeDefined();

      // Should recreate file when read fails
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(mockFs.renameSync).toHaveBeenCalledTimes(1);
    });

    it("should prefer certificatePem over certificatePath when both are provided", () => {
      mockFs.existsSync.mockReturnValue(false);

      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePem: testCertificatePem,
        certificatePath: "/should/not/be/used.pem",
      };

      const strategy = new DelegatedCredentialStrategy(config);
      const credential = strategy.createOBOCredential(authContext);

      expect(credential).toBeDefined();

      const options = (credential as any).options;
      // Should use the generated path from certificatePem, not the provided certificatePath
      expect(options.certificatePath).not.toBe("/should/not/be/used.pem");
      expect(options.certificatePath).toMatch(
        /\/dev\/shm\/azure-cert-mockedhash1234-\d+\.pem/,
      );
    });

    it("should create secure temporary file with proper permissions", () => {
      mockFs.existsSync.mockReturnValue(false);

      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePem: testCertificatePem,
      };

      new DelegatedCredentialStrategy(config);

      // Check that file is written with secure permissions (0o600)
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        testCertificatePem,
        { mode: 0o600 },
      );

      // Verify the temporary file name pattern
      const writeCalls = (mockFs.writeFileSync as any).mock.calls;
      expect(writeCalls[0][0]).toMatch(
        /\/dev\/shm\/azure-cert-mockedhash1234-\d+\.pem\.tmp\.\d+\.\d+\.\w+$/,
      );
    });

    it("should use process.pid in temporary file name for uniqueness", () => {
      mockFs.existsSync.mockReturnValue(false);
      const originalPid = process.pid;

      try {
        // Mock process.pid for testing
        Object.defineProperty(process, "pid", { value: 12345, writable: true });

        const config: DelegatedAuthConfig = {
          clientId: "test-client-id",
          tenantId: "test-tenant-id",
          certificatePem: testCertificatePem,
        };

        const strategy = new DelegatedCredentialStrategy(config);
        const credential = strategy.createOBOCredential(authContext);

        const options = (credential as any).options;
        expect(options.certificatePath).toMatch(
          /azure-cert-mockedhash1234-12345\.pem/,
        );
      } finally {
        // Restore original process.pid
        Object.defineProperty(process, "pid", {
          value: originalPid,
          writable: true,
        });
      }
    });
  });

  describe("Constructor Validation", () => {
    it("should accept valid configuration", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-secret",
      };

      expect(() => new DelegatedCredentialStrategy(config)).not.toThrow();
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

  describe("Error Handling", () => {
    it("should throw error when neither clientSecret nor certificate is provided", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        // No clientSecret or certificate provided
      };

      const strategy = new DelegatedCredentialStrategy(config);

      expect(() => strategy.createOBOCredential(authContext)).toThrow(
        /Client secret is required for secret-based authentication/,
      );
    });

    it("should throw error when empty clientSecret is provided and no certificate", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "", // Empty secret
      };

      const strategy = new DelegatedCredentialStrategy(config);

      expect(() => strategy.createOBOCredential(authContext)).toThrow(
        /Client secret is required for secret-based authentication/,
      );
    });

    it("should throw error when certificate authentication fails", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        certificatePath: "", // Empty certificate path
      };

      const strategy = new DelegatedCredentialStrategy(config);

      expect(() => strategy.createOBOCredential(authContext)).toThrow(
        /Client secret is required for secret-based authentication/,
      );
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

  describe("Token Expiry Validation", () => {
    it("should reject expired token", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-client-secret",
      };

      const expiredContext: TokenBasedAuthContext = {
        ...authContext,
        expiresAt: Date.now() - 1000,
      };

      const strategy = new DelegatedCredentialStrategy(config);

      expect(() => strategy.createOBOCredential(expiredContext)).toThrow(
        /User assertion token expired/,
      );
    });

    it("should reject token that expires at current time", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-client-secret",
      };

      const now = Date.now();
      const expiredContext: TokenBasedAuthContext = {
        ...authContext,
        expiresAt: now,
      };

      const strategy = new DelegatedCredentialStrategy(config);

      expect(() => strategy.createOBOCredential(expiredContext)).toThrow(
        /User assertion token expired/,
      );
    });

    it("should accept valid token", () => {
      const config: DelegatedAuthConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
        clientSecret: "test-client-secret",
      };

      const validContext: TokenBasedAuthContext = {
        ...authContext,
        expiresAt: Date.now() + 60000,
      };

      const strategy = new DelegatedCredentialStrategy(config);

      expect(() => strategy.createOBOCredential(validContext)).not.toThrow();
    });
  });
});
