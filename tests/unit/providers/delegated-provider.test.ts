import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DelegatedCredentialProvider } from "../../../src/providers/delegated-provider.js";
import { DelegatedAuthContext } from "../../../src/providers/auth-context.js";
import { mockCredentialConfigs } from "../../fixtures/mock-data.js";
import {
  setupLoggingMock,
  createMockAzureIdentity,
  createMockParsedToken,
} from "../../utils/test-helpers.js";

describe("DelegatedCredentialProvider", () => {
  let mockLogger: any;
  let azureMocks: any;
  let delegatedContext: DelegatedAuthContext;

  beforeEach(() => {
    mockLogger = setupLoggingMock();
    azureMocks = createMockAzureIdentity();
    delegatedContext = new DelegatedAuthContext(createMockParsedToken());
  });

  describe("Configuration", () => {
    it("should create provider with client secret", () => {
      const provider = new DelegatedCredentialProvider(
        mockCredentialConfigs.withSecret,
      );
      expect(provider).toBeDefined();
    });

    it("should create provider with certificate", () => {
      const provider = new DelegatedCredentialProvider(
        mockCredentialConfigs.withCertificate,
      );
      expect(provider).toBeDefined();
    });

    it("should throw error when neither secret nor certificate provided", () => {
      const invalidConfig = {
        clientId: "test-client-id",
        tenantId: "test-tenant-id",
      };

      expect(
        () => new DelegatedCredentialProvider(invalidConfig as any),
      ).toThrow(
        "Azure authentication requires either client certificate path or client secret",
      );
    });
  });

  describe("Credential Creation", () => {
    it("should create OBO credential with client secret", async () => {
      const provider = new DelegatedCredentialProvider(
        mockCredentialConfigs.withSecret,
      );

      const credential = await provider.createCredential(delegatedContext);

      expect(credential).toBe(azureMocks.mockCredential);
      expect(azureMocks.OnBehalfOfCredentialMock).toHaveBeenCalledWith({
        tenantId: mockCredentialConfigs.withSecret.tenantId,
        clientId: mockCredentialConfigs.withSecret.clientId,
        clientSecret: mockCredentialConfigs.withSecret.clientSecret,
        userAssertionToken: delegatedContext.accessToken,
      });
    });

    it("should create OBO credential with certificate", async () => {
      const providerWithCert = new DelegatedCredentialProvider(
        mockCredentialConfigs.withCertificate,
      );

      const credential =
        await providerWithCert.createCredential(delegatedContext);

      expect(credential).toBe(azureMocks.mockCredential);
      expect(azureMocks.OnBehalfOfCredentialMock).toHaveBeenCalledWith({
        tenantId: mockCredentialConfigs.withCertificate.tenantId,
        clientId: mockCredentialConfigs.withCertificate.clientId,
        certificatePath: mockCredentialConfigs.withCertificate.certificatePath,
        userAssertionToken: delegatedContext.accessToken,
      });
    });

    it("should throw error for non-delegated context", async () => {
      const provider = new DelegatedCredentialProvider(
        mockCredentialConfigs.withSecret,
      );
      const appContext = { mode: "application" };

      await expect(
        provider.createCredential(appContext as any),
      ).rejects.toThrow("Expected delegated auth context, got application");
    });
  });
});
