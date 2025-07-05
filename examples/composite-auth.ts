import {
  createClientProviderWithMapper,
  CredentialType,
  AuthMode,
  getLogger,
  type RequestMapper,
  type AuthRequestFactory,
} from "@jhzhu89/azure-client-pool";

interface ApiRequest {
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  userId?: string;
  scopes?: string[];
}

const compositeClientFactory = {
  async createClient(credentialProvider) {
    const logger = getLogger("composite-factory");
    const appCredential = await credentialProvider.getCredential(
      CredentialType.Application,
    );
    const delegatedCredential = await credentialProvider.getCredential(
      CredentialType.Delegated,
    );

    return {
      async getPublicData() {
        logger.info("Using app credential");
        return { data: "public" };
      },

      async getUserData() {
        logger.info("Using delegated credential");
        return { data: "user" };
      },

      async getAdminData() {
        logger.info("Using composite credentials");
        return { data: "admin" };
      },
    };
  },
};

class ApiRequestMapper implements RequestMapper<ApiRequest> {
  extractAuthData(request: ApiRequest) {
    const authData: { accessToken?: string } & Record<string, any> = {};

    const authHeader =
      request.headers["Authorization"] || request.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      authData.accessToken = authHeader.substring(7);
    }

    if (request.userId) {
      authData.userId = request.userId;
    }

    if (request.scopes) {
      authData.scopes = request.scopes;
    }

    return authData;
  }
}

const createCompositeAuthRequest: AuthRequestFactory = (authData) => {
  if (!authData.accessToken) {
    throw new Error("Access token is required for composite auth");
  }

  return {
    mode: AuthMode.Composite,
    accessToken: authData.accessToken,
  };
};

async function demonstrateCompositeAuth() {
  const logger = getLogger("composite-demo");
  const { getClient } = await createClientProviderWithMapper(
    compositeClientFactory,
    new ApiRequestMapper(),
    createCompositeAuthRequest,
  );

  const requests: ApiRequest[] = [
    {
      endpoint: "/public",
      method: "GET",
      headers: {},
    },
    {
      endpoint: "/user",
      method: "GET",
      headers: { Authorization: "Bearer user.token" },
    },
    {
      endpoint: "/admin",
      method: "GET",
      headers: { Authorization: "Bearer admin.token" },
      scopes: ["admin"],
    },
  ];

  for (const request of requests) {
    logger.info(`Processing ${request.endpoint}`);
    const client = await getClient(request);

    if (request.scopes?.includes("admin")) {
      await client.getAdminData();
    } else if (request.headers["Authorization"]) {
      await client.getUserData();
    } else {
      await client.getPublicData();
    }
  }
}

async function main() {
  const logger = getLogger("main");

  try {
    await demonstrateCompositeAuth();
    logger.info("Composite auth demo completed");
  } catch (error) {
    logger.error("Demo failed:", error);
  }
}

main().catch(console.error);
