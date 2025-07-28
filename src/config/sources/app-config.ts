import { load } from "@azure/app-configuration-provider";
import {
  AzureCliCredential,
  ManagedIdentityCredential,
  ChainedTokenCredential,
  TokenCredential,
} from "@azure/identity";
import { ConfigurationSource } from "../source.js";
import { getLogger } from "../../utils/logging.js";

const logger = getLogger("app-config-source");

export class AppConfigSource implements ConfigurationSource {
  private endpoint: string;
  private keyPrefix: string;
  private labelFilter: string;

  constructor() {
    const endpoint = process.env.AZURE_APPCONFIG_ENDPOINT;
    if (!endpoint) {
      throw new Error(
        "AZURE_APPCONFIG_ENDPOINT environment variable is required",
      );
    }
    this.endpoint = endpoint;
    this.keyPrefix =
      process.env.AZURE_APPCONFIG_CLIENT_POOL_KEY_PREFIX || "clientPool:";
    this.labelFilter =
      process.env.AZURE_APPCONFIG_CLIENT_POOL_LABEL_FILTER || "";

    logger.debug("AppConfigSource initialized", {
      endpoint: this.endpoint,
      keyPrefix: this.keyPrefix,
      labelFilter: this.labelFilter || "(none)",
    });
  }

  async load() {
    const credential = this.createCredential();

    try {
      const settings = await load(this.endpoint, credential, {
        selectors: [
          {
            keyFilter: this.keyPrefix + "*",
            ...(this.labelFilter && { labelFilter: this.labelFilter }),
          },
        ],
        trimKeyPrefixes: [this.keyPrefix],
        keyVaultOptions: {
          credential: credential,
        },
      });

      const config = settings.constructConfigurationObject({ separator: ":" });
      logger.debug("Configuration loaded from App Configuration", {
        configKeys: Object.keys(config),
      });

      return config;
    } catch (error) {
      logger.error("Failed to load configuration from App Configuration", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private createCredential(): TokenCredential {
    const credentials: TokenCredential[] = [new AzureCliCredential()];

    const miClientId = process.env.AZURE_MI_CLIENT_ID;
    if (miClientId) {
      logger.debug("Adding ManagedIdentityCredential with client ID", {
        miClientId,
      });
      credentials.push(new ManagedIdentityCredential({ clientId: miClientId }));
    } else {
      credentials.push(new ManagedIdentityCredential());
    }

    return new ChainedTokenCredential(...credentials);
  }
}
