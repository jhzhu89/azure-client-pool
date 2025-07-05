import { type TokenCredential } from "@azure/identity";
import {
  type DelegatedAuthConfig,
  type ApplicationAuthConfig,
} from "../config/configuration.js";
import { type TokenBasedAuthContext } from "../auth/context.js";
import { ApplicationCredentialStrategy } from "./application-strategy.js";
import { DelegatedCredentialStrategy } from "./delegated-strategy.js";

export class CredentialFactory {
  private readonly applicationStrategy: ApplicationCredentialStrategy;
  private readonly delegatedStrategy: DelegatedCredentialStrategy;

  constructor(
    applicationConfig: ApplicationAuthConfig,
    delegatedConfig: DelegatedAuthConfig,
  ) {
    this.applicationStrategy = new ApplicationCredentialStrategy(
      applicationConfig,
    );
    this.delegatedStrategy = new DelegatedCredentialStrategy(delegatedConfig);
  }

  createApplicationCredential(): TokenCredential {
    return this.applicationStrategy.createCredential();
  }

  createDelegatedCredential(context: TokenBasedAuthContext): TokenCredential {
    return this.delegatedStrategy.createOBOCredential(context);
  }
}
