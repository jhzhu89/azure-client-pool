import { type TokenCredential } from "@azure/identity";
import { type Identity } from "@jhzhu89/jwt-validator";

export const AuthMode = {
  Application: "application",
  Delegated: "delegated",
  Composite: "composite",
} as const;

export type AuthMode = (typeof AuthMode)[keyof typeof AuthMode];

export const CredentialType = {
  Application: "application",
  Delegated: "delegated",
} as const;

export type CredentialType =
  (typeof CredentialType)[keyof typeof CredentialType];

export interface ApplicationAuthRequest {
  readonly mode: typeof AuthMode.Application;
}

export interface DelegatedAuthRequest {
  readonly mode: typeof AuthMode.Delegated;
  readonly identity: Identity;
}

export interface CompositeAuthRequest {
  readonly mode: typeof AuthMode.Composite;
  readonly identity: Identity;
}

export type AuthRequest =
  | ApplicationAuthRequest
  | DelegatedAuthRequest
  | CompositeAuthRequest;

export interface CredentialProvider {
  getCredential(credentialType: CredentialType): Promise<TokenCredential>;
}

export interface ClientFactory<TClient, TOptions = void> {
  createClient(
    credentialProvider: CredentialProvider,
    options?: TOptions,
  ): Promise<TClient>;
  getClientFingerprint?(options?: TOptions): string | undefined;
}

export const ApplicationAuthStrategy = {
  Cli: "cli",
  ManagedIdentity: "mi",
  Chain: "chain",
} as const;

export type ApplicationAuthStrategy =
  (typeof ApplicationAuthStrategy)[keyof typeof ApplicationAuthStrategy];
