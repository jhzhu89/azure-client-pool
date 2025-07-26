import {
  createClientProvider,
  type ClientFactory,
  CredentialType,
  AuthMode,
  type AuthRequest,
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
    const appCredential = await credentialProvider.getCredential(
      CredentialType.Application,
    );

    return {
      async queryResources(query: string) {
        console.log(`Using app credential for resource query: ${query}`);
        console.log(`App credential type: ${appCredential?.constructor.name}`);
        return { resources: [], count: 0 };
      },

      async listSubscriptions() {
        console.log(`Using app credential for subscription list`);
        console.log(`App credential type: ${appCredential?.constructor.name}`);
        return { subscriptions: [] };
      },

      async getUserProfile() {
        console.log(`Using delegated credential for user profile`);
        const delegatedCredential = await credentialProvider.getCredential(
          CredentialType.Delegated,
        );
        console.log(
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
  console.log("=== Demonstrating Application Authentication ===");

  const provider = await createClientProvider(multiServiceFactory);

  const authRequest: AuthRequest = { mode: AuthMode.Application };

  const client = await provider.getClient(authRequest);
  await client.queryResources("Resources | limit 5");
  await client.listSubscriptions();

  const cachedClient = await provider.getClient(authRequest);
  console.log("Retrieved cached client:", {
    isCached: client === cachedClient,
  });
}

async function demonstrateDifferentOptions() {
  console.log("=== Demonstrating Different Options ===");

  const provider = await createClientProvider(multiServiceFactory);

  const authRequest: AuthRequest = { mode: AuthMode.Application };

  const options1: MultiServiceOptions = { resourceEndpoint: "eastus" };
  const options2: MultiServiceOptions = { resourceEndpoint: "westus" };

  const client1 = await provider.getClient(authRequest, options1);
  const client2 = await provider.getClient(authRequest, options2);

  console.log("Different options get different clients:", {
    differentClients: client1 !== client2,
  });

  await client1.queryResources("EastUS resources");
  await client2.queryResources("WestUS resources");
}

async function demonstrateCacheInvalidation() {
  console.log("=== Demonstrating Cache Invalidation ===");

  const provider = await createClientProvider(multiServiceFactory);

  const authRequest: AuthRequest = { mode: AuthMode.Application };

  const client1 = await provider.getClient(authRequest);
  console.log("Created first client");

  const invalidated = await provider.invalidateClientCache(authRequest);
  console.log("Cache invalidated:", { invalidated });

  const client2 = await provider.getClient(authRequest);
  console.log("Created second client after invalidation");

  await client2.queryResources("Post-invalidation query");
}

async function demonstrateErrorHandling() {
  console.log("=== Demonstrating Error Handling ===");

  const provider = await createClientProvider(multiServiceFactory);

  const authRequest: AuthRequest = { mode: AuthMode.Application };

  try {
    const client = await provider.getClient(authRequest);
    console.log(
      "Client created successfully, attempting to call getUserProfile...",
    );

    await client.getUserProfile();
    console.warn("This should not happen - getUserProfile should fail!");
  } catch (error) {
    console.log("Expected error caught:", {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorType: error?.constructor.name,
    });
    console.log(
      "This demonstrates that ApplicationAuthRequest cannot provide delegated credentials",
    );
  }

  console.log("Error handling demonstration completed");
}

async function main() {
  console.log("Starting client pool demonstrations...");

  try {
    await demonstrateApplicationAuth();
    await demonstrateDifferentOptions();
    await demonstrateCacheInvalidation();
    await demonstrateErrorHandling();

    console.log(
      "=== Application auth demonstrations completed successfully! ===",
    );
    console.log(
      "=== Skipping delegated/composite auth demos (require real JWT tokens) ===",
    );
  } catch (error) {
    console.error("Error during demonstrations:", error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main, multiServiceFactory };
