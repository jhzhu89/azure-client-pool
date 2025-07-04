import {
  type TokenCredential,
  AzureCliCredential,
  OnBehalfOfCredential,
  type OnBehalfOfCredentialCertificateOptions,
  type OnBehalfOfCredentialSecretOptions,
} from "@azure/identity";
import { type DelegatedAuthConfig } from "../config/configuration.js";
import { type TokenBasedAuthContext } from "../auth/context.js";
import { getLogger } from "../utils/logging.js";

const logger = getLogger("credential-factory");

export class CredentialFactory {
  private readonly usesCertificate: boolean;

  constructor(private delegatedConfig: DelegatedAuthConfig) {
    this.usesCertificate = !!delegatedConfig.certificatePath;

    if (!this.usesCertificate && !delegatedConfig.clientSecret) {
      throw new Error(
        "Azure authentication requires either client certificate path or client secret",
      );
    }

    if (this.usesCertificate && delegatedConfig.clientSecret) {
      throw new Error(
        "Only one of certificatePath or clientSecret should be provided",
      );
    }
  }

  createApplicationCredential(): TokenCredential {
    logger.debug("Creating AzureCliCredential");
    return new AzureCliCredential();
  }

  createDelegatedCredential(context: TokenBasedAuthContext): TokenCredential {
    logger.debug("Creating delegated credential", {
      tenantId: context.tenantId,
    });

    const credential = this.createOBOCredential(context);

    logger.debug("Delegated credential created", {
      tenantId: context.tenantId,
    });

    return credential;
  }

  private createOBOCredential(
    context: TokenBasedAuthContext,
  ): OnBehalfOfCredential {
    const baseOptions = {
      tenantId: context.tenantId,
      clientId: this.delegatedConfig.clientId,
      userAssertionToken: context.accessToken,
    };

    if (this.usesCertificate) {
      if (!this.delegatedConfig.certificatePath) {
        throw new Error(
          "Certificate path is required for certificate-based authentication",
        );
      }
      const options: OnBehalfOfCredentialCertificateOptions = {
        ...baseOptions,
        certificatePath: this.delegatedConfig.certificatePath,
      };
      return new OnBehalfOfCredential(options);
    } else {
      if (!this.delegatedConfig.clientSecret) {
        throw new Error(
          "Client secret is required for secret-based authentication",
        );
      }
      const options: OnBehalfOfCredentialSecretOptions = {
        ...baseOptions,
        clientSecret: this.delegatedConfig.clientSecret,
      };
      return new OnBehalfOfCredential(options);
    }
  }
}
