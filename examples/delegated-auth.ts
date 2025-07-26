import {
  createClientProvider,
  createRequestAwareClientProvider,
  AuthMode,
  CredentialType,
  type AuthRequest,
  IdentityExtractor,
} from "@jhzhu89/azure-client-pool";
import { Identity } from "@jhzhu89/jwt-validator";

const delegatedClientFactory = {
  async createClient(credentialProvider) {
    const delegatedCredential = await credentialProvider.getCredential(
      CredentialType.Delegated,
    );

    return {
      async getUserProfile() {
        console.log("Getting user profile with delegated credential");
        return { user: { id: "user123", name: "John Doe" } };
      },

      async getUserFiles() {
        console.log("Getting user files with delegated credential");
        return { files: ["document1.docx", "presentation.pptx"] };
      },
    };
  },
};

async function demonstrateDirectDelegatedAuth() {
  const provider = await createClientProvider(delegatedClientFactory);

  const identity = new Identity("user.jwt.token", {
    oid: "user-123",
    tid: "tenant-456",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const authRequest: AuthRequest = {
    mode: AuthMode.Delegated,
    identity,
  };

  const client = await provider.getClient(authRequest);
  await client.getUserProfile();
  await client.getUserFiles();

  console.log("Direct delegated auth completed");
}

async function demonstrateRequestAwareDelegatedAuth() {
  const authStrategyResolver = (identity?: Identity): AuthRequest => {
    if (!identity) {
      return { mode: AuthMode.Application };
    }
    return { mode: AuthMode.Delegated, identity };
  };

  const { getClient } = await createRequestAwareClientProvider(
    delegatedClientFactory,
    new IdentityExtractor(),
    authStrategyResolver,
  );

  const identity = new Identity("user.jwt.token", {
    oid: "user-456",
    tid: "tenant-789",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const request = { identity };

  const client = await getClient(request);
  await client.getUserProfile();
  await client.getUserFiles();

  console.log("Request-aware delegated auth completed");
}

async function main() {
  try {
    await demonstrateDirectDelegatedAuth();
    await demonstrateRequestAwareDelegatedAuth();

    console.log("All delegated auth demos completed");
  } catch (error) {
    console.error("Demo failed:", error);
  }
}

main().catch(console.error);
