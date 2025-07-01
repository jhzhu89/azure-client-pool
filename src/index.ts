export {
  getAzureAuthConfig,
  type AzureAuthConfig,
} from "./config/configuration.js";

export {
  createClientProvider,
  createClientProviderWithMapper,
  type AuthenticatedClientProvider,
} from "./managers/authenticated-provider.js";

export {
  McpRequestMapper,
  type RequestMapper,
} from "./utils/request-mapper.js";

export type {
  AuthRequest,
  ApplicationAuthRequest,
  DelegatedAuthRequest,
  ClientFactory,
} from "./types/index.js";

export { logger } from "./utils/logging.js";
