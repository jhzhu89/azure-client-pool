import { type TokenCredential } from "@azure/identity";
import {
  type DelegatedAuthContext,
  type ApplicationAuthContext,
} from "./auth-context.js";

export interface CredentialProvider<
  TContext = DelegatedAuthContext | ApplicationAuthContext,
> {
  createCredential(context: TContext): Promise<TokenCredential>;
}

export type ApplicationCredentialProvider =
  CredentialProvider<ApplicationAuthContext>;

export type DelegatedCredentialProvider =
  CredentialProvider<DelegatedAuthContext>;
