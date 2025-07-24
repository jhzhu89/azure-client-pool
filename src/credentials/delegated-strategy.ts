import {
  OnBehalfOfCredential,
  type OnBehalfOfCredentialCertificateOptions,
  type OnBehalfOfCredentialSecretOptions,
} from "@azure/identity";
import { type DelegatedAuthConfig } from "../config/configuration.js";
import { type TokenBasedAuthContext } from "../auth/context.js";
import { getLogger } from "../utils/logging.js";
import * as fs from "fs";
import * as crypto from "crypto";

const logger = getLogger("delegated-strategy");

export class DelegatedCredentialStrategy {
  private readonly effectiveCertPath: string | undefined;

  constructor(private readonly config: DelegatedAuthConfig) {
    if (config.certificatePem) {
      this.effectiveCertPath = this.createCertificateFile(
        config.certificatePem,
      );
    } else {
      this.effectiveCertPath = config.certificatePath;
    }
  }

  private createCertificateFile(certificatePem: string): string {
    const hash = crypto
      .createHash("sha256")
      .update(certificatePem)
      .digest("hex")
      .substring(0, 16);

    const certPath = `/dev/shm/azure-cert-${hash}-${process.pid}.pem`;

    if (this.isValidCertificateFile(certPath, certificatePem)) {
      return certPath;
    }

    const tempPath = `${certPath}.tmp.${Date.now()}.${Math.random().toString(36)}`;

    fs.writeFileSync(tempPath, certificatePem, { mode: 0o600 });
    fs.renameSync(tempPath, certPath);

    return certPath;
  }

  private isValidCertificateFile(
    certPath: string,
    certificatePem: string,
  ): boolean {
    if (!fs.existsSync(certPath)) {
      return false;
    }

    try {
      const existingContent = fs.readFileSync(certPath, "utf8");
      return existingContent === certificatePem;
    } catch {
      return false;
    }
  }

  createOBOCredential(context: TokenBasedAuthContext): OnBehalfOfCredential {
    const now = Date.now();

    if (context.expiresAt <= now) {
      const expiredAt = new Date(context.expiresAt).toISOString();

      logger.error("User assertion token has expired", {
        tenantId: context.tenantId,
        userObjectId: context.userObjectId,
        expiredAt,
      });

      throw new Error(
        `User assertion token expired at ${expiredAt}. Please refresh the token and try again.`,
      );
    }

    const baseOptions = {
      tenantId: context.tenantId,
      clientId: this.config.clientId,
      userAssertionToken: context.accessToken,
    };

    if (this.effectiveCertPath) {
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
    if (!this.effectiveCertPath) {
      throw new Error(
        "Certificate is required for certificate-based authentication",
      );
    }

    return {
      ...baseOptions,
      certificatePath: this.effectiveCertPath,
      sendCertificateChain: true,
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
