import {
  createClientProvider,
  AuthMode,
  CredentialType,
  getLogger,
} from "@jhzhu89/azure-client-pool";

const simpleClientFactory = {
  async createClient(credentialProvider) {
    const logger = getLogger("simple-factory");
    const credential = await credentialProvider.getCredential(
      CredentialType.Application,
    );

    return {
      async doSomething() {
        logger.info("Using credential:", { 
          credentialType: credential.constructor.name 
        });
        return "success";
      },
    };
  },
};

async function main() {
  const logger = getLogger("simple-example");
  
  try {
    const provider = await createClientProvider(simpleClientFactory);
    const client = await provider.getClient({ mode: AuthMode.Application });
    
    const result = await client.doSomething();
    logger.info("Operation completed successfully", { result });
  } catch (error) {
    logger.error("Error during execution:", error);
  }
}

main().catch(console.error);
