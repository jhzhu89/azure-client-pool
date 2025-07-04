import jwt, { type JwtHeader, type VerifyErrors } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import {
  type ParsedJwtToken,
  type JwtUserClaims,
  ParsedJwtToken as Token,
} from "./token.js";
import { AuthError, AUTH_ERROR_CODES } from "../../utils/errors.js";
import { getLogger } from "../../utils/logging.js";
import { type JwtConfig } from "../../config/configuration.js";

const logger = getLogger("jwt-validator");

export class JwtHandler {
  private readonly jwksClient: jwksClient.JwksClient;
  private readonly config: {
    clientId: string;
    tenantId: string;
    audience: string;
    issuer: string;
    clockTolerance: number;
  };

  constructor(config: JwtConfig) {
    this.config = {
      clientId: config.clientId,
      tenantId: config.tenantId,
      audience: config.audience ?? config.clientId,
      issuer: config.issuer ?? `https://sts.windows.net/${config.tenantId}/`,
      clockTolerance: config.clockTolerance,
    };

    this.jwksClient = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: config.cacheMaxAge,
      rateLimit: true,
      jwksRequestsPerMinute: config.jwksRequestsPerMinute,
    });
  }

  async validateToken(accessToken: string): Promise<ParsedJwtToken> {
    try {
      logger.debug("Validating JWT token", { tenantId: this.config.tenantId });
      const payload = await this.verifyToken(accessToken);
      const claims = this.extractClaims(payload);
      logger.debug("JWT token validated", {
        tenantId: claims.tenantId,
        userObjectId: claims.userObjectId,
        expiresAt: new Date(claims.expiresAt).toISOString(),
      });
      return new Token(claims, accessToken);
    } catch (error) {
      logger.error("Token validation failed", {
        tenantId: this.config.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AuthError(
        AUTH_ERROR_CODES.jwt_validation_failed,
        `Token validation failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async isValid(accessToken: string): Promise<boolean> {
    try {
      await this.validateToken(accessToken);
      return true;
    } catch {
      return false;
    }
  }

  private verifyToken(accessToken: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const getKey = (
        header: JwtHeader,
        callback: (err: Error | null, key?: string) => void,
      ) => {
        this.jwksClient.getSigningKey(header.kid as string, (err, key) => {
          callback(err, key?.getPublicKey());
        });
      };

      jwt.verify(
        accessToken,
        getKey,
        {
          audience: this.config.audience,
          issuer: this.config.issuer,
          algorithms: ["RS256"],
          clockTolerance: this.config.clockTolerance,
        },
        (
          err: VerifyErrors | null,
          decoded: string | Record<string, unknown> | undefined,
        ) => {
          if (err) return reject(err);

          const payload = decoded as Record<string, unknown>;
          if (payload.tid !== this.config.tenantId) {
            return reject(new Error("Invalid tenant"));
          }

          resolve(payload);
        },
      );
    });
  }

  private extractClaims(payload: Record<string, unknown>): JwtUserClaims {
    if (!payload.oid || !payload.tid || !payload.exp) {
      throw new Error("Missing required claims");
    }

    return {
      userObjectId: payload.oid as string,
      tenantId: payload.tid as string,
      expiresAt: (payload.exp as number) * 1000,
    };
  }
}
