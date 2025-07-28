import { ParsedJwtToken } from "./jwt/token.js";
import { AuthMode } from "../types.js";

interface BaseAuthContext {
  readonly mode: AuthMode;
}

export interface ApplicationAuthContext extends BaseAuthContext {
  readonly mode: typeof AuthMode.Application;
}

export interface UserAssertionAuthContext extends BaseAuthContext {
  readonly mode: typeof AuthMode.Delegated | typeof AuthMode.Composite;
  readonly tenantId: string;
  readonly userObjectId: string;
  readonly userAssertionToken: string;
  readonly expiresAt: number;
}

export type AuthContext = ApplicationAuthContext | UserAssertionAuthContext;

export type TokenBasedAuthContext = UserAssertionAuthContext;

export const AuthContextFactory = {
  application: (): ApplicationAuthContext => ({
    mode: AuthMode.Application,
  }),

  delegated: (token: ParsedJwtToken): UserAssertionAuthContext => ({
    mode: AuthMode.Delegated,
    tenantId: token.tenantId,
    userObjectId: token.userObjectId,
    userAssertionToken: token.rawToken,
    expiresAt: token.expiresAt,
  }),

  composite: (token: ParsedJwtToken): UserAssertionAuthContext => ({
    mode: AuthMode.Composite,
    tenantId: token.tenantId,
    userObjectId: token.userObjectId,
    userAssertionToken: token.rawToken,
    expiresAt: token.expiresAt,
  }),
};
