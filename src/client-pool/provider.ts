import { type ClientFactory, AuthMode } from "../types.js";
import { ClientPool } from "./pool.js";
import { CredentialManager } from "../credentials/manager.js";
import { type AuthRequest } from "../types.js";
import { type AuthContext, AuthContextFactory } from "../auth/context.js";
import { JwtHandler } from "../auth/jwt/validator.js";
import {
  getApplicationAuthConfig,
  getDelegatedAuthConfig,
  getClientManagerConfig,
  getJwtConfig,
} from "../config/configuration.js";
import {
  type RequestMapper,
  type AuthRequestFactory,
} from "./request-mapper.js";

export interface ClientProvider<TClient, TOptions = void> {
  getClient(authRequest: AuthRequest, options?: TOptions): Promise<TClient>;
  invalidateClientCache(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<boolean>;
}

class ClientProviderImpl<TClient, TOptions = void>
  implements ClientProvider<TClient, TOptions>
{
  constructor(
    private clientPool: ClientPool<TClient, TOptions>,
    private jwtHandler?: JwtHandler,
  ) {}

  async getClient(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<TClient> {
    const context = await this.createAuthContext(authRequest);
    return await this.clientPool.getClient(context, options);
  }

  async invalidateClientCache(
    authRequest: AuthRequest,
    options?: TOptions,
  ): Promise<boolean> {
    const context = await this.createAuthContext(authRequest);
    return await this.clientPool.removeCachedClient(context, options);
  }

  private async createAuthContext(
    authRequest: AuthRequest,
  ): Promise<AuthContext> {
    switch (authRequest.mode) {
      case AuthMode.Application: {
        return AuthContextFactory.application();
      }

      case AuthMode.Delegated: {
        if (!this.jwtHandler) {
          throw new Error(
            "JwtHandler is required for delegated authentication",
          );
        }
        const parsedToken = await this.jwtHandler.validateToken(
          authRequest.accessToken,
        );
        return AuthContextFactory.delegated(parsedToken);
      }

      case AuthMode.Composite: {
        if (!this.jwtHandler) {
          throw new Error(
            "JwtHandler is required for composite authentication",
          );
        }
        const compositeToken = await this.jwtHandler.validateToken(
          authRequest.accessToken,
        );
        return AuthContextFactory.composite(compositeToken);
      }

      default: {
        const _exhaustive: never = authRequest;
        throw new Error(`Unknown auth mode: ${_exhaustive}`);
      }
    }
  }
}

export async function createClientProvider<TClient, TOptions = void>(
  clientFactory: ClientFactory<TClient, TOptions>,
): Promise<ClientProvider<TClient, TOptions>> {
  const applicationConfig = getApplicationAuthConfig();
  const delegatedConfig = getDelegatedAuthConfig();
  const clientManagerConfig = getClientManagerConfig();

  const credentialManager = new CredentialManager(
    applicationConfig,
    delegatedConfig,
    clientManagerConfig,
  );
  const clientPool = new ClientPool(
    clientFactory,
    credentialManager,
    clientManagerConfig,
  );

  const jwtConfig = getJwtConfig();
  const jwtHandler = new JwtHandler(jwtConfig);

  return new ClientProviderImpl(clientPool, jwtHandler);
}

export async function createClientProviderWithMapper<
  TClient,
  TRequest,
  TOptions = void,
>(
  clientFactory: ClientFactory<TClient, TOptions>,
  requestMapper: RequestMapper<TRequest, TOptions>,
  authRequestFactory: AuthRequestFactory,
): Promise<{
  getClient(request: TRequest): Promise<TClient>;
  invalidateClientCache(request: TRequest): Promise<boolean>;
}> {
  const clientProvider = await createClientProvider(clientFactory);

  return {
    getClient: async (request: TRequest) => {
      const authData = requestMapper.extractAuthData(request);
      const authRequest = authRequestFactory(authData);
      const options = requestMapper.extractOptions
        ? requestMapper.extractOptions(request)
        : undefined;
      return await clientProvider.getClient(authRequest, options);
    },
    invalidateClientCache: async (request: TRequest) => {
      const authData = requestMapper.extractAuthData(request);
      const authRequest = authRequestFactory(authData);
      const options = requestMapper.extractOptions
        ? requestMapper.extractOptions(request)
        : undefined;
      return await clientProvider.invalidateClientCache(authRequest, options);
    },
  };
}
