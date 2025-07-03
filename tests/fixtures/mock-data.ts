export const mockClientConfigs = {
  application: {
    cacheKeyPrefix: "test-app",
    clientCache: {
      slidingTtl: 100,
      maxSize: 5,
    },
    credentialCache: {
      slidingTtl: 200,
      maxSize: 3,
      absoluteTTL: 300,
    },
  },
  delegated: {
    cacheKeyPrefix: "test-del",
    clientCache: {
      slidingTtl: 150,
      maxSize: 10,
    },
    credentialCache: {
      slidingTtl: 250,
      maxSize: 8,
      absoluteTTL: 400,
    },
  },
};

export function createMockAuthContexts() {
  const ApplicationAuthContext =
    require("../../src/providers/auth-context.js").ApplicationAuthContext;
  const DelegatedAuthContext =
    require("../../src/providers/auth-context.js").DelegatedAuthContext;
  const { createMockParsedToken } = require("../utils/test-helpers.js");

  return {
    application: new ApplicationAuthContext(),
    delegated: new DelegatedAuthContext(
      createMockParsedToken({
        userObjectId: "test-user-123",
        tenantId: "test-tenant-456",
      }),
    ),
  };
}

export const mockCredentialConfigs = {
  withSecret: {
    clientId: "test-client-id",
    tenantId: "test-tenant-id",
    clientSecret: "test-secret",
  },
  withCertificate: {
    clientId: "test-client-id",
    tenantId: "test-tenant-id",
    certificatePath: "/path/to/cert.pem",
    certificatePassword: "cert-password",
  },
};

export const mockJwtConfigs = {
  default: {
    clientId: "test-client-id",
    tenantId: "test-tenant-id",
    clockTolerance: 300,
    cacheMaxAge: 86400000,
    jwksRequestsPerMinute: 10,
  },
  custom: {
    clientId: "test-client-id",
    tenantId: "test-tenant-id",
    audience: "custom-audience",
    issuer: "custom-issuer",
    clockTolerance: 600,
    cacheMaxAge: 172800000,
    jwksRequestsPerMinute: 20,
  },
};
