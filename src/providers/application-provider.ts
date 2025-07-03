import { AzureCliCredential, type TokenCredential } from "@azure/identity";
import { type ApplicationAuthContext } from "./auth-context.js";
import { type ApplicationCredentialProvider as IApplicationCredentialProvider } from "./credential-types.js";
import { getLogger } from "../utils/logging.js";

const logger = getLogger("application-provider");

export class ApplicationCredentialProvider
  implements IApplicationCredentialProvider
{
  async createCredential(
    _context: ApplicationAuthContext,
  ): Promise<TokenCredential> {
    logger.debug("Creating AzureCliCredential");
    return new AzureCliCredential();
  }
}
