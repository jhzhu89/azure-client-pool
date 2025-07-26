import {
  createClientProvider,
  AuthMode,
  CredentialType,
} from "@jhzhu89/azure-client-pool";

const simpleClientFactory = {
  async createClient(credentialProvider) {
    const credential = await credentialProvider.getCredential(
      CredentialType.Application,
    );

    return {
      async doSomething() {
        console.log("Using credential:", credential.constructor.name);
        return "success";
      },
    };
  },
};

async function main() {
  const provider = await createClientProvider(simpleClientFactory);

  const authRequest = { mode: AuthMode.Application };
  const client = await provider.getClient(authRequest);

  await client.doSomething();
}

main().catch(console.error);
