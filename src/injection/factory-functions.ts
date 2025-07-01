import { JwtHandler, type JwtConfig } from "../validation/jwt-validator.js";
import { DelegatedCredentialProvider } from "../providers/delegated-provider.js";
import { ApplicationCredentialProvider } from "../providers/application-provider.js";
import { ApplicationClientManager } from "../managers/application-manager.js";
import { DelegatedClientManager } from "../managers/delegated-manager.js";
import { type ClientFactory } from "../types/client-types.js";
import {
  type DelegatedAuthenticationConfig,
  type ClientManagerConfig,
} from "../config/configuration.js";

export function createJwtHandler(config: JwtConfig): JwtHandler {
  return new JwtHandler(config);
}

export function createApplicationClientManager<TClient, TOptions = void>(
  clientFactory: ClientFactory<TClient, TOptions>,
  config: ClientManagerConfig,
): ApplicationClientManager<TClient, TOptions> {
  const applicationProvider = new ApplicationCredentialProvider();
  return new ApplicationClientManager(
    applicationProvider,
    clientFactory,
    config,
  );
}

export function createDelegatedClientManager<TClient, TOptions = void>(
  config: DelegatedAuthenticationConfig,
  clientManagerConfig: ClientManagerConfig,
  clientFactory: ClientFactory<TClient, TOptions>,
): DelegatedClientManager<TClient, TOptions> {
  const providerConfig: DelegatedAuthenticationConfig = {
    clientId: config.clientId,
    tenantId: config.tenantId,
    ...(config.clientSecret && { clientSecret: config.clientSecret }),
    ...(config.certificatePath && { certificatePath: config.certificatePath }),
    ...(config.certificatePassword && {
      certificatePassword: config.certificatePassword,
    }),
  };

  const delegatedProvider = new DelegatedCredentialProvider(providerConfig);

  return new DelegatedClientManager(
    delegatedProvider,
    clientFactory,
    clientManagerConfig,
  );
}
