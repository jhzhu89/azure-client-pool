import { type ClientFactory } from "../types.js";
import { ClientProviderImpl, type ClientProvider } from "./client-provider.js";
import { CredentialManager } from "../credentials/manager.js";
import { type AuthRequest } from "../types.js";
import { ConfigurationManager } from "../config/manager.js";
import { ConfigurationSource } from "../config/source.js";
import {
  type RequestExtractor,
  type AuthStrategyResolver,
} from "./request-extraction.js";

export async function createClientProvider<TClient, TOptions = void>(
  clientFactory: ClientFactory<TClient, TOptions>,
  options?: { configSource?: ConfigurationSource },
): Promise<ClientProvider<TClient, TOptions>> {
  const configManager = new ConfigurationManager(options?.configSource);

  const applicationConfig = await configManager.getApplicationAuthConfig();
  const delegatedConfig = await configManager.getDelegatedAuthConfig();
  const clientManagerConfig = await configManager.getClientManagerConfig();

  const credentialManager = await CredentialManager.create(
    applicationConfig,
    clientManagerConfig,
    delegatedConfig,
  );
  const clientProvider = new ClientProviderImpl(
    clientFactory,
    credentialManager,
    clientManagerConfig,
  );

  return clientProvider;
}

function processRequest<TRequest extends Record<string, unknown>, TOptions>(
  request: TRequest,
  requestExtractor: RequestExtractor<TRequest, TOptions>,
  authStrategyResolver: AuthStrategyResolver,
): { authRequest: AuthRequest; options?: TOptions } {
  const identity = requestExtractor.extractIdentity(request);
  const authRequest = authStrategyResolver(identity);
  const options = requestExtractor.extractOptions
    ? requestExtractor.extractOptions(request)
    : undefined;

  return { authRequest, options };
}

export async function createRequestAwareClientProvider<
  TClient,
  TRequest extends Record<string, unknown>,
  TOptions = void,
>(
  clientFactory: ClientFactory<TClient, TOptions>,
  requestExtractor: RequestExtractor<TRequest, TOptions>,
  authStrategyResolver: AuthStrategyResolver,
  options?: { configSource?: ConfigurationSource },
): Promise<{
  getClient(request: TRequest): Promise<TClient>;
  invalidateClientCache(request: TRequest): Promise<boolean>;
}> {
  const clientProvider = await createClientProvider(clientFactory, options);

  return {
    getClient: async (request: TRequest) => {
      const { authRequest, options } = processRequest(
        request,
        requestExtractor,
        authStrategyResolver,
      );
      return clientProvider.getClient(authRequest, options);
    },
    invalidateClientCache: async (request: TRequest) => {
      const { authRequest, options } = processRequest(
        request,
        requestExtractor,
        authStrategyResolver,
      );
      return clientProvider.invalidateClientCache(authRequest, options);
    },
  };
}
