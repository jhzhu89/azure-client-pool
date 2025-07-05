import {
  OnBehalfOfCredential,
  type OnBehalfOfCredentialCertificateOptions,
  type OnBehalfOfCredentialSecretOptions,
} from "@azure/identity";
import { type DelegatedAuthConfig } from "../config/configuration.js";
import { type TokenBasedAuthContext } from "../auth/context.js";
import { getLogger } from "../utils/logging.js";

const logger = getLogger("delegated-strategy");

export class DelegatedCredentialStrategy {
  private readonly usesCertificate: boolean;

  constructor(private readonly config: DelegatedAuthConfig) {
    this.usesCertificate = !!config.certificatePath;

    if (!this.usesCertificate && !config.clientSecret) {
      throw new Error(
        "Azure authentication requires either client certificate path or client secret",
      );
    }

    if (this.usesCertificate && config.clientSecret) {
      throw new Error(
        "Only one of certificatePath or clientSecret should be provided",
      );
    }
  }

  createOBOCredential(context: TokenBasedAuthContext): OnBehalfOfCredential {
    logger.debug("Creating OBO credential", {
      tenantId: context.tenantId,
      clientId: this.config.clientId,
      usesCertificate: this.usesCertificate,
    });

    const baseOptions = {
      tenantId: context.tenantId,
      clientId: this.config.clientId,
      userAssertionToken: context.accessToken,
    };

    if (this.usesCertificate) {
      logger.debug("Using certificate-based OBO credential");
      return new OnBehalfOfCredential(
        this.createCertificateOptions(baseOptions),
      );
    }

    logger.debug("Using secret-based OBO credential");
    return new OnBehalfOfCredential(this.createSecretOptions(baseOptions));
  }

  private createCertificateOptions(baseOptions: {
    tenantId: string;
    clientId: string;
    userAssertionToken: string;
  }): OnBehalfOfCredentialCertificateOptions {
    if (!this.config.certificatePath) {
      logger.error(
        "Certificate path is missing for certificate-based authentication",
      );
      throw new Error(
        "Certificate path is required for certificate-based authentication",
      );
    }
    logger.debug("Building certificate options", {
      certificatePath: this.config.certificatePath,
    });
    return {
      ...baseOptions,
      certificatePath: this.config.certificatePath,
    };
  }

  private createSecretOptions(baseOptions: {
    tenantId: string;
    clientId: string;
    userAssertionToken: string;
  }): OnBehalfOfCredentialSecretOptions {
    if (!this.config.clientSecret) {
      logger.error("Client secret is missing for secret-based authentication");
      throw new Error(
        "Client secret is required for secret-based authentication",
      );
    }
    logger.debug("Building secret options");
    return {
      ...baseOptions,
      clientSecret: this.config.clientSecret,
    };
  }
}
