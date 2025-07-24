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
  private readonly delegatedStrategy: DelegatedCredentialStrategy | null;

  private constructor(
    applicationConfig: ApplicationAuthConfig,
    delegatedConfig?: DelegatedAuthConfig,
  ) {
    this.applicationStrategy = new ApplicationCredentialStrategy(
      applicationConfig,
    );
    this.delegatedStrategy = delegatedConfig
      ? new DelegatedCredentialStrategy(delegatedConfig)
      : null;
  }

  static async create(
    applicationConfig: ApplicationAuthConfig,
    delegatedConfig?: DelegatedAuthConfig,
  ): Promise<CredentialFactory> {
    return new CredentialFactory(applicationConfig, delegatedConfig);
  }

  createApplicationCredential(): TokenCredential {
    return this.applicationStrategy.createCredential();
  }

  createDelegatedCredential(context: TokenBasedAuthContext): TokenCredential {
    if (!this.delegatedStrategy) {
      throw new Error(
        "Delegated authentication not configured. Please provide delegated auth configuration with: " +
          "clientId, tenantId, and either clientSecret OR certificate configuration (certificatePath/certificatePem).",
      );
    }
    return this.delegatedStrategy.createOBOCredential(context);
  }
}
