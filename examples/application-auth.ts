import {
  createClientProvider,
  type ClientFactory,
  type ApplicationAuthRequest,
} from "../src/index.ts";

// Example: Azure Resource Graph client factory
interface ResourceGraphClient {
  query(query: string): Promise<any>;
}

interface ResourceGraphOptions {
  endpoint?: string;
}

const resourceGraphFactory: ClientFactory<
  ResourceGraphClient,
  ResourceGraphOptions
> = {
  async createClient(credential, options) {
    // Mock implementation - replace with actual Azure SDK
    return {
      async query(query: string) {
        console.log(`Executing query: ${query}`);
        return { data: [], count: 0 };
      },
    };
  },

  getClientFingerprint(options) {
    return `resource-graph-${options?.endpoint || "default"}`;
  },
};

async function main() {
  try {
    // Create application client provider
    const clientProvider = await createClientProvider(resourceGraphFactory);

    // Create application auth request
    const authRequest: ApplicationAuthRequest = {
      mode: "application",
    };

    // Get authenticated client
    const client = await clientProvider.getAuthenticatedClient(authRequest);

    // Use the client
    const result = await client.query("Resources | limit 10");
    console.log("Query result:", result);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main, resourceGraphFactory };
