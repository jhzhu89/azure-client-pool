import {
  createClientProvider,
  createClientProviderWithMapper,
  AuthMode,
  CredentialType,
  getLogger,
  McpRequestMapper,
  type AuthRequestFactory,
} from "@jhzhu89/azure-client-pool";

const delegatedClientFactory = {
  async createClient(credentialProvider) {
    const logger = getLogger("delegated-factory");
    const delegatedCredential = await credentialProvider.getCredential(
      CredentialType.Delegated,
    );

    return {
      async getUserProfile() {
        logger.info("Getting user profile with delegated credential");
        return { user: { id: "user123", name: "John Doe" } };
      },

      async getUserFiles() {
        logger.info("Getting user files with delegated credential");
        return { files: ["document1.docx", "presentation.pptx"] };
      },
    };
  },
};

const createDelegatedAuthRequest: AuthRequestFactory = (authData) => {
  if (!authData.accessToken) {
    throw new Error("Access token is required for delegated auth");
  }

  return {
    mode: AuthMode.Delegated,
    accessToken: authData.accessToken,
  };
};

async function demonstrateDirectDelegatedAuth() {
  const logger = getLogger("direct-delegated");
  const provider = await createClientProvider(delegatedClientFactory);

  const authRequest = {
    mode: AuthMode.Delegated,
    accessToken: "user.jwt.token",
  };

  const client = await provider.getClient(authRequest);
  await client.getUserProfile();
  await client.getUserFiles();

  logger.info("Direct delegated auth completed");
}

async function demonstrateMcpDelegatedAuth() {
  const logger = getLogger("mcp-delegated");
  const { getClient } = await createClientProviderWithMapper(
    delegatedClientFactory,
    new McpRequestMapper(),
    createDelegatedAuthRequest,
  );

  const mcpRequest = {
    method: "getUserData",
    params: {
      arguments: {
        access_token: "mcp.user.token",
        userId: "user456",
      },
    },
  };

  const client = await getClient(mcpRequest);
  await client.getUserProfile();
  await client.getUserFiles();

  logger.info("MCP delegated auth completed");
}

async function main() {
  const logger = getLogger("delegated-demo");

  try {
    await demonstrateDirectDelegatedAuth();
    await demonstrateMcpDelegatedAuth();

    logger.info("All delegated auth demos completed");
  } catch (error) {
    logger.error("Demo failed:", error);
  }
}

main().catch(console.error);
