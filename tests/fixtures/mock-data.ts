// JWT configuration mocks for testing
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
