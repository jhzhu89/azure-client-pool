import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  ApplicationAuthStrategy,
  DelegatedAuthStrategy,
} from "../../../src/providers/strategies.js";
import {
  ApplicationAuthContext,
  DelegatedAuthContext,
} from "../../../src/providers/auth-context.js";
import {
  createMockJwtHandler,
  createMockParsedToken,
  setupLoggingMock,
} from "../../utils/test-helpers.js";

describe("AuthenticationStrategy", () => {
  beforeEach(() => {
    setupLoggingMock();
  });

  describe("ApplicationAuthStrategy", () => {
    let strategy: ApplicationAuthStrategy;

    beforeEach(() => {
      strategy = new ApplicationAuthStrategy();
    });

    it("should create ApplicationAuthContext", async () => {
      const authRequest = { mode: "application" as const };
      const context = await strategy.createAuthContext(authRequest);

      expect(context).toBeInstanceOf(ApplicationAuthContext);
      expect(context.mode).toBe("application");
    });
  });

  describe("DelegatedAuthStrategy", () => {
    let strategy: DelegatedAuthStrategy;
    let mockJwtHandler: any;

    beforeEach(() => {
      mockJwtHandler = createMockJwtHandler();
      strategy = new DelegatedAuthStrategy(mockJwtHandler);
    });

    it("should create DelegatedAuthContext with valid token", async () => {
      const authRequest = {
        mode: "delegated" as const,
        accessToken: "valid-jwt-token",
      };
      mockJwtHandler.validateToken.mockResolvedValueOnce(
        createMockParsedToken({
          userObjectId: "test-user-id",
          tenantId: "test-tenant-id",
          rawToken: "valid-jwt-token",
        }),
      );

      const context = await strategy.createAuthContext(authRequest);

      expect(context).toBeInstanceOf(DelegatedAuthContext);
      expect(context.mode).toBe("delegated");
      expect(mockJwtHandler.validateToken).toHaveBeenCalledWith(
        "valid-jwt-token",
      );
    });

    it("should handle JWT validation errors", async () => {
      const authRequest = {
        mode: "delegated" as const,
        accessToken: "invalid-jwt-token",
      };
      mockJwtHandler.validateToken.mockRejectedValueOnce(
        new Error("Token validation failed"),
      );

      await expect(strategy.createAuthContext(authRequest)).rejects.toThrow(
        "Authentication error: Token validation failed",
      );
    });
  });

  describe("Strategy Integration", () => {
    it("should handle different strategy types in parallel", async () => {
      const applicationStrategy = new ApplicationAuthStrategy();
      const mockJwtHandler = createMockJwtHandler();
      const delegatedStrategy = new DelegatedAuthStrategy(mockJwtHandler);

      mockJwtHandler.validateToken.mockResolvedValueOnce(
        createMockParsedToken(),
      );

      const [appContext, delContext] = await Promise.all([
        applicationStrategy.createAuthContext({ mode: "application" }),
        delegatedStrategy.createAuthContext({
          mode: "delegated",
          accessToken: "valid-token",
        }),
      ]);

      expect(appContext.mode).toBe("application");
      expect(delContext.mode).toBe("delegated");
    });
  });
});
