import {
  createClientProvider,
  type ClientFactory,
  type ApplicationAuthRequest,
  CredentialType,
  AuthMode,
  setRootLogger,
  getLogger,
} from "@jhzhu89/azure-client-pool";

interface MultiServiceClient {
  queryResources(query: string): Promise<any>;
  listSubscriptions(): Promise<any>;
  getUserProfile(): Promise<any>;
}

interface MultiServiceOptions {
  resourceEndpoint?: string;
  managementEndpoint?: string;
  graphEndpoint?: string;
}

const multiServiceFactory: ClientFactory<
  MultiServiceClient,
  MultiServiceOptions
> = {
  async createClient(credentialProvider, options) {
    const logger = getLogger("multi-service-factory");
    const appCredential = await credentialProvider.getCredential(
      CredentialType.Application,
    );

    return {
      async queryResources(query: string) {
        logger.info(`Using app credential for resource query: ${query}`);
        logger.debug(`App credential type: ${appCredential?.constructor.name}`);
        return { resources: [], count: 0 };
      },

      async listSubscriptions() {
        logger.info(`Using app credential for subscription list`);
        logger.debug(`App credential type: ${appCredential?.constructor.name}`);
        return { subscriptions: [] };
      },

      async getUserProfile() {
        logger.info(`Using delegated credential for user profile`);
        const delegatedCredential = await credentialProvider.getCredential(
          CredentialType.Delegated,
        );
        logger.debug(
          `Delegated credential type: ${delegatedCredential?.constructor.name}`,
        );
        return { user: { id: "user123", name: "Test User" } };
      },
    };
  },

  getClientFingerprint(options) {
    const parts = [
      options?.resourceEndpoint || "default-resource",
      options?.managementEndpoint || "default-mgmt",
      options?.graphEndpoint || "default-graph",
    ];
    return `multi-service-${parts.join("-")}`;
  },
};

async function demonstrateApplicationAuth() {
  const logger = getLogger("app-auth-demo");
  logger.info("=== Demonstrating Application Authentication ===");

  const provider = await createClientProvider(multiServiceFactory);

  const authRequest: ApplicationAuthRequest = { mode: AuthMode.Application };

  const client = await provider.getClient(authRequest);
  await client.queryResources("Resources | limit 5");
  await client.listSubscriptions();

  const cachedClient = await provider.getClient(authRequest);
  logger.info("Retrieved cached client:", {
    isCached: client === cachedClient,
  });
}

async function demonstrateDifferentOptions() {
  const logger = getLogger("options-demo");
  logger.info("=== Demonstrating Different Options ===");

  const provider = await createClientProvider(multiServiceFactory);

  const authRequest: ApplicationAuthRequest = { mode: AuthMode.Application };

  const options1: MultiServiceOptions = { resourceEndpoint: "eastus" };
  const options2: MultiServiceOptions = { resourceEndpoint: "westus" };

  const client1 = await provider.getClient(authRequest, options1);
  const client2 = await provider.getClient(authRequest, options2);

  logger.info("Different options get different clients:", {
    differentClients: client1 !== client2,
  });

  await client1.queryResources("EastUS resources");
  await client2.queryResources("WestUS resources");
}

async function demonstrateCacheInvalidation() {
  const logger = getLogger("cache-demo");
  logger.info("=== Demonstrating Cache Invalidation ===");

  const provider = await createClientProvider(multiServiceFactory);

  const authRequest: ApplicationAuthRequest = { mode: AuthMode.Application };

  const client1 = await provider.getClient(authRequest);
  logger.info("Created first client");

  const invalidated = await provider.invalidateClientCache(authRequest);
  logger.info("Cache invalidated:", { invalidated });

  const client2 = await provider.getClient(authRequest);
  logger.info("Created second client after invalidation");

  await client2.queryResources("Post-invalidation query");
}

async function demonstrateErrorHandling() {
  const logger = getLogger("error-demo");
  logger.info("=== Demonstrating Error Handling ===");

  const provider = await createClientProvider(multiServiceFactory);

  const authRequest: ApplicationAuthRequest = { mode: AuthMode.Application };

  try {
    const client = await provider.getClient(authRequest);
    logger.info(
      "Client created successfully, attempting to call getUserProfile...",
    );

    await client.getUserProfile();
    logger.warn("This should not happen - getUserProfile should fail!");
  } catch (error) {
    logger.info("Expected error caught:", {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor.name,
    });
    logger.info(
      "This demonstrates that ApplicationAuthRequest cannot provide delegated credentials",
    );
  }

  logger.info("Error handling demonstration completed");
}

async function main() {
  const logger = getLogger("example");
  setRootLogger(logger);

  logger.info("Starting client pool demonstrations...");

  try {
    await demonstrateApplicationAuth();
    await demonstrateDifferentOptions();
    await demonstrateCacheInvalidation();
    await demonstrateErrorHandling();

    logger.info(
      "=== Application auth demonstrations completed successfully! ===",
    );
    logger.info(
      "=== Skipping delegated/composite auth demos (require real JWT tokens) ===",
    );
  } catch (error) {
    logger.error("Error during demonstrations:", error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main, multiServiceFactory };
