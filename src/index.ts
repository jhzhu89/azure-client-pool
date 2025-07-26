export {
  createClientProvider,
  createRequestAwareClientProvider,
} from "./client-pool/factory.js";

export { type ClientProvider } from "./client-pool/client-provider.js";

export { type ConfigurationSource } from "./config/source.js";

export {
  IdentityExtractor,
  type RequestExtractor,
  type AuthStrategyResolver,
} from "./client-pool/request-extraction.js";

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
