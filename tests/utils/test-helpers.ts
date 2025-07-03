import { beforeEach, afterEach, mock } from "bun:test";

export function mockEnvironment(envVars: Record<string, string>) {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...envVars };
  });

  afterEach(() => {
    process.env = originalEnv;
  });
}

export function createMockLogger() {
  return {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    child: mock(() => createMockLogger()),
  };
}

export function setupLoggingMock() {
  const mockLogger = createMockLogger();
  mock.module("../../src/utils/logging.js", () => ({
    getLogger: () => mockLogger,
  }));
  return mockLogger;
}

export function createMockTokenCredential() {
  return {
    getToken: mock(async () => ({
      token: "mock-access-token",
      expiresOnTimestamp: Date.now() + 3600000,
    })),
  };
}

export function createMockClientFactory() {
  const mockClient = {
    dispose: mock(() => {}),
    [Symbol.asyncDispose]: mock(async () => {}),
    query: mock(async () => ({ data: [] })),
  };

  return {
    createClient: mock(async () => {
      return { ...mockClient };
    }),
    getClientFingerprint: mock((options?: any) =>
      options?.endpoint ? `test-${options.endpoint}` : "test-default",
    ),
    mockClient,
  };
}

export function createMockAzureIdentity() {
  const mockCredential = createMockTokenCredential();
  const OnBehalfOfCredentialMock = mock(function (options: any) {
    return mockCredential;
  });

  mock.module("@azure/identity", () => ({
    OnBehalfOfCredential: OnBehalfOfCredentialMock,
  }));

  return { OnBehalfOfCredentialMock, mockCredential };
}

export function createMockParsedToken(
  overrides: Partial<{
    userObjectId: string;
    tenantId: string;
    expiresAt: number;
    rawToken: string;
  }> = {},
) {
  const claims = {
    userObjectId: "test-user-id",
    tenantId: "test-tenant-id",
    expiresAt: Date.now() + 3600000,
    ...overrides,
  };
  const rawToken = overrides.rawToken || "mock-jwt-token";

  return {
    claims,
    rawToken,
    get userObjectId() {
      return claims.userObjectId;
    },
    get tenantId() {
      return claims.tenantId;
    },
    get expiresAt() {
      return claims.expiresAt;
    },
  };
}

export function createMockJwtHandler() {
  const validateTokenMock = mock(async (token: string) => {
    return createMockParsedToken({ rawToken: token });
  });

  const isValidMock = mock(async () => true);

  return {
    validateToken: validateTokenMock,
    isValid: isValidMock,
    // Add other JwtHandler properties as needed for type compatibility
    jwksClient: {} as any,
    config: {} as any,
    verifyToken: mock(async () => ({})),
    extractClaims: mock(() => ({})),
  } as any;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
