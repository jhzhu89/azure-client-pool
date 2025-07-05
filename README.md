# @jhzhu89/azure-client-pool

> Azure client lifecycle management with caching and multiple authentication strategies

[![npm version](https://badge.fury.io/js/%40jhzhu89%2Fazure-client-pool.svg)](https://badge.fury.io/js/%40jhzhu89%2Fazure-client-pool)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

A TypeScript library for managing Azure SDK clients with automatic caching and multiple authentication strategies. It addresses common patterns when working with Azure services:

- Client instance reuse to avoid creation overhead
- Multiple authentication flows (application credentials, delegated access)
- Intelligent caching based on authentication context and client configuration
- On-Behalf-Of (OBO) token flows for multi-user applications

## Authentication Strategies

### Application Mode
Supports different credential strategies:

- **CLI Strategy** (`cli`): Uses Azure CLI user credentials (`az login`) - user identity
- **Managed Identity Strategy** (`mi`): Uses Azure Managed Identity - application identity
- **Chain Strategy** (`chain`): Tries CLI user credentials first, falls back to Managed Identity

CLI strategy uses the logged-in user's identity, while Managed Identity uses the application's identity. Chain strategy provides flexibility for local development (user) and cloud deployment (application).

### Delegated Mode  
Uses On-Behalf-Of (OBO) flow with user access tokens from OAuth2/OpenID Connect flows.

- Requires application credentials (client secret or certificate)
- Maintains user identity and permissions through token delegation
- Suitable for multi-user web applications

### Composite Mode
Supports both application and delegated credentials within the same provider instance.

## Caching Behavior

Clients are cached based on:
- **Authentication context**: User identity, tenant, credential type
- **Client configuration**: Endpoints, options, and other parameters

Each unique combination gets its own cache entry. For example:
- Different users accessing the same service get separate cached clients
- Same user accessing different endpoints (e.g., different Kusto clusters) get separate cached clients
- Different client configurations result in separate cache entries

## Usage

### Basic Application Authentication

```typescript
import { createClientProvider, type ApplicationAuthRequest, type ClientFactory } from '@jhzhu89/azure-client-pool';

// Define your client factory
const clientFactory: ClientFactory<YourClient, YourOptions> = {
  async createClient(credentialProvider, options) {
    const credential = await credentialProvider.getCredential('application');
    return new YourAzureClient(credential, options);
  },
  getClientFingerprint(options) {
    return `your-client-${options?.endpoint || 'default'}`;
  }
};

// Create provider and get authenticated client
const provider = await createClientProvider(clientFactory);
const client = await provider.getAuthenticatedClient({ mode: 'application' });
```

### Delegated Authentication

```typescript
import { type DelegatedAuthRequest } from '@jhzhu89/azure-client-pool';

const authRequest: DelegatedAuthRequest = {
  mode: 'delegated',
  accessToken: 'user-access-token-from-oauth-flow'
};

const client = await provider.getAuthenticatedClient(authRequest);
```

### Custom Request Mapping

For custom request formats, use `createClientProviderWithMapper`:

```typescript
import { createClientProviderWithMapper, type RequestMapper } from '@jhzhu89/azure-client-pool';

// Define your custom request format
interface MyCustomRequest {
  userId: string;
  accessToken: string;
  endpoint: string;
}

// Map custom requests to auth requests and options
const requestMapper: RequestMapper<MyCustomRequest, { endpoint: string }> = {
  mapToAuthRequest: (request) => ({
    mode: 'delegated',
    accessToken: request.accessToken
  }),
  mapToOptions: (request) => ({ endpoint: request.endpoint })
};

// Create provider with mapper
const provider = await createClientProviderWithMapper(clientFactory, requestMapper);

// Use with your custom request format
const client = await provider.getAuthenticatedClient({
  userId: 'user123',
  accessToken: 'access-token',
  endpoint: 'https://mycluster.kusto.windows.net'
});
```

## Configuration

### Application Mode

Set the authentication strategy via environment variable:

```bash
# Default strategy (tries CLI, falls back to Managed Identity)
export AZURE_APPLICATION_AUTH_STRATEGY=chain

# CLI only
export AZURE_APPLICATION_AUTH_STRATEGY=cli

# Managed Identity only
export AZURE_APPLICATION_AUTH_STRATEGY=mi

# Optional: Specify Managed Identity client ID
export AZURE_MANAGED_IDENTITY_CLIENT_ID=your-client-id
```

### Delegated Mode

```bash
export AZURE_CLIENT_ID=your-client-id
export AZURE_TENANT_ID=your-tenant-id

# Option 1: Client secret
export AZURE_CLIENT_SECRET=your-client-secret

# Option 2: Certificate
export AZURE_CLIENT_CERTIFICATE_PATH=/path/to/cert.pem
export AZURE_CLIENT_CERTIFICATE_PASSWORD=cert-password
```

## Use Cases

| Scenario | Application Mode | Delegated Mode |
|----------|------------------|----------------|
| Local development | ✅ Azure CLI integration | ⚠️ Requires app registration |
| CI/CD pipelines | ✅ Managed Identity or CLI | ❌ No user context |
| Single-tenant apps | ✅ Direct credential access | ⚠️ Added complexity |
| Multi-user web apps | ❌ No user context | ✅ Maintains user identity |
| API services | ✅ Service identity | ✅ User delegation |
| Microsoft Graph access | ⚠️ Limited to credential scope | ✅ User permissions |

## Installation

```bash
npm install @jhzhu89/azure-client-pool
```

Or using other package managers:

```bash
# Bun
bun add @jhzhu89/azure-client-pool

# pnpm  
pnpm add @jhzhu89/azure-client-pool

# Yarn
yarn add @jhzhu89/azure-client-pool
```

## Features

This library provides:

- **Multiple authentication strategies**: Azure CLI, Managed Identity, and certificate/secret-based authentication
- **Intelligent caching**: Automatic client reuse with configurable TTL and size limits
- **JWT validation**: Built-in token validation for delegated authentication
- **Request deduplication**: Prevents concurrent duplicate requests
- **TypeScript support**: Full type safety and IntelliSense support
- **Flexible request mapping**: Support for custom request formats

## Examples

See the [examples](./examples) directory for complete usage patterns.

## Development

```bash
# Install dependencies
bun install

# Build the package
bun run build

# Run tests
bun test

# Development mode
bun run dev
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## License

MIT License - see the [LICENSE](./LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/jhzhu89/azure-client-pool)
- [npm Package](https://www.npmjs.com/package/@jhzhu89/azure-client-pool)
- [Issues](https://github.com/jhzhu89/azure-client-pool/issues)
