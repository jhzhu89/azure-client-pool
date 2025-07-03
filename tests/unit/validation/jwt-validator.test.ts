import { describe, it, expect, beforeEach, mock } from "bun:test";
import { JwtHandler } from "../../../src/validation/jwt-validator.js";
import { AuthError, AUTH_ERROR_CODES } from "../../../src/utils/errors.js";
import { mockJwtConfigs } from "../../fixtures/mock-data.js";

mock.module("../../../src/utils/logging.js", () => ({
  getLogger: () => ({
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  }),
}));

mock.module("jsonwebtoken", () => ({
  default: {
    verify: mock((token: string, getKey: any, options: any, callback: any) => {
      if (token === "invalid-token") {
        return callback(new Error("Invalid token"));
      }
      if (token === "wrong-tenant-token") {
        return callback(null, {
          oid: "test-user-id",
          tid: "wrong-tenant",
          exp: Math.floor(Date.now() / 1000) + 3600,
        });
      }
      if (token === "missing-claims-token") {
        return callback(null, {
          tid: "test-tenant-id",
          incomplete: "token",
        });
      }

      callback(null, {
        oid: "test-user-id",
        tid: "test-tenant-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
    }),
  },
}));

mock.module("jwks-rsa", () => ({
  default: mock((options: any) => ({
    getSigningKey: mock((kid: string, callback: any) => {
      if (kid === "invalid-kid") {
        return callback(new Error("Key not found"));
      }
      callback(null, {
        getPublicKey: () => "mock-public-key",
      });
    }),
  })),
}));

describe("JwtHandler", () => {
  let jwtHandler: JwtHandler;

  beforeEach(() => {
    jwtHandler = new JwtHandler(mockJwtConfigs.default);
  });

  describe("Token Validation", () => {
    it("should validate a valid JWT token", async () => {
      const token = "valid-jwt-token";

      const result = await jwtHandler.validateToken(token);

      expect(result.userObjectId).toBe("test-user-id");
      expect(result.tenantId).toBe("test-tenant-id");
      expect(result.rawToken).toBe(token);
      expect(typeof result.expiresAt).toBe("number");
    });

    it("should throw AuthError for invalid token", async () => {
      const token = "invalid-token";

      await expect(jwtHandler.validateToken(token)).rejects.toThrow(AuthError);

      try {
        await jwtHandler.validateToken(token);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(
          AUTH_ERROR_CODES.jwt_validation_failed,
        );
        expect((error as AuthError).message).toContain(
          "Token validation failed",
        );
      }
    });

    it("should throw AuthError for wrong tenant", async () => {
      const token = "wrong-tenant-token";

      await expect(jwtHandler.validateToken(token)).rejects.toThrow(AuthError);

      try {
        await jwtHandler.validateToken(token);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toContain("Invalid tenant");
      }
    });
  });

  describe("Token Validity Check", () => {
    it("should return true for valid token", async () => {
      const token = "valid-jwt-token";

      const isValid = await jwtHandler.isValid(token);

      expect(isValid).toBe(true);
    });

    it("should return false for invalid token", async () => {
      const token = "invalid-token";

      const isValid = await jwtHandler.isValid(token);

      expect(isValid).toBe(false);
    });
  });
});
