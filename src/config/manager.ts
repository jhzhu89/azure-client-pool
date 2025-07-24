import { ApplicationAuthStrategy } from "../types.js";
import {
  configSchema,
  type ClientPoolConfiguration,
  type ApplicationAuthConfig,
  type DelegatedAuthConfig,
  type JwtConfig,
  type ClientManagerConfig,
} from "./configuration.js";
import { ConfigurationSource } from "./source.js";
import { EnvironmentSource, AppConfigSource } from "./sources/index.js";
import { getLogger } from "../utils/logging.js";

const logger = getLogger("config-manager");

export class ConfigurationManager {
  private source: ConfigurationSource;
  private configPromise?: Promise<ClientPoolConfiguration>;

  constructor(source?: ConfigurationSource) {
    this.source = source || this.createConfigSource();
  }

  async getConfiguration(): Promise<ClientPoolConfiguration> {
    if (!this.configPromise) {
      logger.debug("Loading configuration for first time");
      this.configPromise = this.loadAndValidateConfig();
    }
    return this.configPromise;
  }

  private async loadAndValidateConfig(): Promise<ClientPoolConfiguration> {
    logger.debug("Loading raw configuration from source");
    const raw = await this.source.load();
    const config = configSchema.parse(raw);
    this.validate(config);
    return config;
  }

  private createConfigSource(): ConfigurationSource {
    if (process.env.AZURE_APPCONFIG_ENDPOINT) {
      logger.debug("Using AppConfigSource", {
        endpoint: process.env.AZURE_APPCONFIG_ENDPOINT,
      });
      return new AppConfigSource();
    }
    return new EnvironmentSource();
  }

  private validate(config: ClientPoolConfiguration): void {
    if (
      config.jwt.clockTolerance < 0 ||
      config.jwt.cacheMaxAge <= 0 ||
      config.jwt.jwksRequestsPerMinute <= 0
    ) {
      throw new Error("JWT configuration must have valid values");
    }
  }

  async getApplicationAuthConfig(): Promise<ApplicationAuthConfig> {
    const config = await this.getConfiguration();
    return {
      strategy:
        config.azure.applicationAuthStrategy || ApplicationAuthStrategy.Chain,
      ...(config.azure.managedIdentityClientId && {
        managedIdentityClientId: config.azure.managedIdentityClientId,
      }),
    };
  }

  async getDelegatedAuthConfig(): Promise<DelegatedAuthConfig | undefined> {
    const config = await this.getConfiguration();
    const {
      clientId,
      tenantId,
      clientSecret,
      certificatePath,
      certificatePem,
    } = config.azure;

    const hasSecret = !!clientSecret;
    const hasCertificatePath = !!certificatePath;
    const hasCertificatePem = !!certificatePem;
    const hasCredentials = hasSecret || hasCertificatePath || hasCertificatePem;
    const hasRequiredFields = !!clientId && !!tenantId;

    if (!hasCredentials || !hasRequiredFields) {
      return undefined;
    }

    let selectedCredential = {};
    if (hasCredentials) {
      if (hasCertificatePem) {
        selectedCredential = {
          certificatePem,
        };
      } else if (hasCertificatePath) {
        selectedCredential = {
          certificatePath,
        };
      } else if (hasSecret) {
        selectedCredential = { clientSecret };
      }
    }

    return {
      clientId,
      tenantId,
      ...selectedCredential,
    };
  }

  async getJwtConfig(): Promise<JwtConfig | undefined> {
    const config = await this.getConfiguration();

    if (!config.azure.clientId || !config.azure.tenantId) {
      return undefined;
    }

    return {
      clientId: config.azure.clientId,
      tenantId: config.azure.tenantId,
      clockTolerance: config.jwt.clockTolerance,
      cacheMaxAge: config.jwt.cacheMaxAge,
      jwksRequestsPerMinute: config.jwt.jwksRequestsPerMinute,
      ...(config.jwt.audience && { audience: config.jwt.audience }),
      ...(config.jwt.issuer && { issuer: config.jwt.issuer }),
    };
  }

  async getClientManagerConfig(): Promise<ClientManagerConfig> {
    const config = await this.getConfiguration();
    return {
      cacheKeyPrefix: config.cache.keyPrefix,
      clientCache: {
        slidingTtl: config.cache.clientCacheSlidingTtl,
        maxSize: config.cache.clientCacheMaxSize,
        bufferMs: config.cache.clientCacheBufferMs,
      },
      credentialCache: {
        slidingTtl: config.cache.credentialCacheSlidingTtl,
        maxSize: config.cache.credentialCacheMaxSize,
        absoluteTtl: config.cache.credentialCacheAbsoluteTtl,
      },
    };
  }
}
