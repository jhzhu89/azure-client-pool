import { ApplicationAuthContext } from "../providers/auth-context.js";
import { type ApplicationCredentialProvider } from "../providers/credential-types.js";
import { type ClientFactory } from "../types/client-types.js";
import { type ClientManagerConfig } from "../config/configuration.js";
import { BaseClientManager } from "./base-manager.js";

export class ApplicationClientManager<
  TClient,
  TOptions = void,
> extends BaseClientManager<TClient, ApplicationAuthContext, TOptions> {
  constructor(
    applicationProvider: ApplicationCredentialProvider,
    clientFactory: ClientFactory<TClient, TOptions>,
    config: ClientManagerConfig,
  ) {
    super(applicationProvider, clientFactory, config);
  }

  protected getAuthMode(): string {
    return "application";
  }

  protected getCredentialCacheKeyComponents(
    _context: ApplicationAuthContext,
  ): string[] {
    return [];
  }

  protected createClientCacheKey(
    _context: ApplicationAuthContext,
    options?: TOptions,
  ): string {
    const parts = [this.config.cacheKeyPrefix, "application"];

    const fingerprint = this.clientFactory.getClientFingerprint?.(options);
    if (fingerprint) {
      parts.push(fingerprint);
    }

    return parts.join("::");
  }

  protected getLoggingContext(
    _context: ApplicationAuthContext,
  ): Record<string, unknown> {
    return {};
  }
}
