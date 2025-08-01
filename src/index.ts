export {
  createClientProvider,
  createClientProviderWithMapper,
  type ClientProvider,
} from "./client-pool/provider.js";

export { type ConfigurationSource } from "./config/source.js";

export {
  McpRequestMapper,
  type RequestMapper,
  type AuthRequestFactory,
} from "./client-pool/request-mapper.js";

export type {
  AuthRequest,
  ApplicationAuthRequest,
  DelegatedAuthRequest,
  CompositeAuthRequest,
  ClientFactory,
  CredentialProvider,
} from "./types.js";

export { AuthMode, CredentialType } from "./types.js";

export { getLogger, setRootLogger, type Logger } from "./utils/logging.js";
