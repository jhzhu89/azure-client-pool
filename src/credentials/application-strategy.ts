import { type TokenCredential } from "@azure/identity";
import {
  AzureCliCredential,
  ManagedIdentityCredential,
  ChainedTokenCredential,
} from "@azure/identity";
import { type ApplicationAuthConfig } from "../config/configuration.js";
import { ApplicationAuthStrategy } from "../types.js";
import { getLogger } from "../utils/logging.js";

const logger = getLogger("application-strategy");

export class ApplicationCredentialStrategy {
  constructor(private readonly config: ApplicationAuthConfig) {}

  createCredential(): TokenCredential {
    logger.debug("Creating application credential", {
      strategy: this.config.strategy,
      hasManagedIdentityClientId: !!this.config.managedIdentityClientId,
    });

    switch (this.config.strategy) {
      case ApplicationAuthStrategy.Cli:
        logger.debug("Using Azure CLI credential");
        return new AzureCliCredential();

      case ApplicationAuthStrategy.ManagedIdentity:
        logger.debug("Using Managed Identity credential", {
          clientId: this.config.managedIdentityClientId,
        });
        return new ManagedIdentityCredential(
          this.config.managedIdentityClientId
            ? { clientId: this.config.managedIdentityClientId }
            : undefined,
        );

      case ApplicationAuthStrategy.Chain:
        logger.debug("Using chained credential (CLI -> ManagedIdentity)", {
          clientId: this.config.managedIdentityClientId,
        });
        return new ChainedTokenCredential(
          new AzureCliCredential(),
          new ManagedIdentityCredential(
            this.config.managedIdentityClientId
              ? { clientId: this.config.managedIdentityClientId }
              : undefined,
          ),
        );

      default:
        logger.error("Unsupported application strategy", {
          strategy: this.config.strategy,
        });
        throw new Error(
          `Unsupported application strategy: ${this.config.strategy}`,
        );
    }
  }
}
