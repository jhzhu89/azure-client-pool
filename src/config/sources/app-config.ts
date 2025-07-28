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
    this.keyPrefix = process.env.AZURE_APPCONFIG_KEY_PREFIX || "clientPool:";
    this.labelFilter = process.env.AZURE_APPCONFIG_LABEL_FILTER || "";

    logger.debug("AppConfigSource initialized", {
      endpoint: this.endpoint,
      keyPrefix: this.keyPrefix,
      labelFilter: this.labelFilter || "(none)",
    });
  }

  async load() {
    logger.debug("Loading configuration from Azure App Configuration");
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

      // Debug certificate data from Key Vault references
      const certificateKeys = Object.keys(config).filter(
        (key) =>
          key.toLowerCase().includes("cert") ||
          key.toLowerCase().includes("pfx") ||
          key.toLowerCase().includes("private") ||
          key.toLowerCase().includes("key"),
      );

      certificateKeys.forEach((key) => {
        const value = config[key];
        if (typeof value === "string" && value.length > 100) {
          logger.debug("Certificate-related config detected", {
            key,
            valueLength: value.length,
            startsWithPem: value.startsWith("-----BEGIN"),
            startsWithMii: value.startsWith("MII"),
            firstChars: value.substring(0, 50),
            lastChars: value.substring(value.length - 50),
            isProbablyBase64: /^[A-Za-z0-9+/]+=*$/.test(
              value.replace(/\s/g, ""),
            ),
          });
        }
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
