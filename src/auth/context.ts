import { ParsedJwtToken } from "./jwt/token.js";
import { AuthMode } from "../types.js";

interface BaseAuthContext {
  readonly mode: AuthMode;
}

export interface ApplicationAuthContext extends BaseAuthContext {
  readonly mode: typeof AuthMode.Application;
}

export interface TokenBasedAuthContext extends BaseAuthContext {
  readonly mode: typeof AuthMode.Delegated | typeof AuthMode.Composite;
  readonly tenantId: string;
  readonly userObjectId: string;
  readonly userAssertion: string;
  readonly expiresAt: number;
}

export type AuthContext = ApplicationAuthContext | TokenBasedAuthContext;

export const AuthContextFactory = {
  application: (): ApplicationAuthContext => ({
    mode: AuthMode.Application,
  }),

  delegated: (token: ParsedJwtToken): TokenBasedAuthContext => ({
    mode: AuthMode.Delegated,
    tenantId: token.tenantId,
    userObjectId: token.userObjectId,
    userAssertion: token.rawToken,
    expiresAt: token.expiresAt,
  }),

  composite: (token: ParsedJwtToken): TokenBasedAuthContext => ({
    mode: AuthMode.Composite,
    tenantId: token.tenantId,
    userObjectId: token.userObjectId,
    userAssertion: token.rawToken,
    expiresAt: token.expiresAt,
  }),
};
