import {
  createClientProvider,
  createRequestAwareClientProvider,
  CredentialType,
  AuthMode,
  type AuthRequest,
  IdentityExtractor,
  type RequestExtractor,
} from "@jhzhu89/azure-client-pool";
import { Identity } from "@jhzhu89/jwt-validator";

interface ApiRequest extends Record<string, unknown> {
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  identity?: Identity;
  requiresComposite?: boolean;
}

const compositeClientFactory = {
  async createClient(credentialProvider) {
    return {
      async getPublicData() {
        console.log("Using app credential for public data");
        const appCredential = await credentialProvider.getCredential(
          CredentialType.Application,
        );
        return { data: "public" };
      },

      async getUserData() {
        console.log("Using delegated credential for user data");
        const delegatedCredential = await credentialProvider.getCredential(
          CredentialType.Delegated,
        );
        return { data: "user" };
      },

      async getAdminData() {
        console.log("Using composite credentials for admin data");
        const appCredential = await credentialProvider.getCredential(
          CredentialType.Application,
        );
        const delegatedCredential = await credentialProvider.getCredential(
          CredentialType.Delegated,
        );
        return { data: "admin" };
      },
    };
  },
};

class ApiRequestExtractor
  implements RequestExtractor<ApiRequest, { requiresComposite: boolean }>
{
  extractIdentity(request: ApiRequest): Identity | undefined {
    return request.identity;
  }

  extractOptions(request: ApiRequest): { requiresComposite: boolean } {
    return { requiresComposite: request.requiresComposite || false };
  }
}

const createAuthRequest = (identity?: Identity): AuthRequest => {
  if (!identity) {
    return { mode: AuthMode.Application };
  }
  return { mode: AuthMode.Composite, identity };
};

async function demonstrateDirectCompositeAuth() {
  const provider = await createClientProvider(compositeClientFactory);

  const identity = new Identity("admin.token", {
    oid: "admin-123",
    tid: "tenant-456",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const authRequest: AuthRequest = {
    mode: AuthMode.Composite,
    identity,
  };

  const client = await provider.getClient(authRequest);
  await client.getAdminData();

  console.log("Direct composite auth completed");
}

async function demonstrateRequestAwareCompositeAuth() {
  const { getClient } = await createRequestAwareClientProvider(
    compositeClientFactory,
    new ApiRequestExtractor(),
    createAuthRequest,
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
      identity: new Identity("user.token", {
        oid: "user-456",
        tid: "tenant-456",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    },
    {
      endpoint: "/admin",
      method: "GET",
      headers: { Authorization: "Bearer admin.token" },
      identity: new Identity("admin.token", {
        oid: "admin-789",
        tid: "tenant-456",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      requiresComposite: true,
    },
  ];

  for (const request of requests) {
    console.log(`Processing ${request.endpoint}`);
    const client = await getClient(request);

    if (request.requiresComposite) {
      await client.getAdminData();
    } else if (request.identity) {
      await client.getUserData();
    } else {
      await client.getPublicData();
    }
  }
}

async function main() {
  try {
    await demonstrateDirectCompositeAuth();
    await demonstrateRequestAwareCompositeAuth();
    console.log("Composite auth demo completed");
  } catch (error) {
    console.error("Demo failed:", error);
  }
}

main().catch(console.error);
