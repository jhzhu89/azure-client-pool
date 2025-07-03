# @jhzhu89/azure-client-pool

> Azure client management with caching and dual authentication modes

[![npm version](https://badge.fury.io/js/%40jhzhu89%2Fazure-client-pool.svg)](https://badge.fury.io/js/%40jhzhu89%2Fazure-client-pool)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why This Library?

When building applications with Azure SDK, you need to:
- Reuse clients efficiently to avoid creating new instances per request
- Handle different authentication scenarios (local development vs production)
- Manage On-Behalf-Of flows for user-delegated access
- Cache clients per user and configuration (different endpoints, options)

This library provides a unified interface for these patterns with intelligent caching.

## Authentication Modes

### Application Mode
- **Uses**: Azure CLI credentials (`az login`)
- **Best for**: Local development, single-user applications, prototyping
- **Caching**: Simple global cache
- **Setup**: Minimal configuration required

### Delegated Mode  
- **Uses**: On-Behalf-Of flow with user JWT tokens
- **Best for**: Multi-user web applications, production environments
- **Caching**: Per-user and per-tenant with configuration fingerprinting
- **Setup**: Requires client secret or certificate

## Smart Caching

The library automatically caches clients based on:
- **Authentication context** (user identity, tenant)
- **Client configuration** (endpoints, options)

For example, the same user accessing different Kusto clusters will get separate cached clients:
- `mykusto.eastus.kusto.windows.net`
- `mykusto.westus.kusto.windows.net`

Each configuration gets its own cache entry, preventing conflicts while maximizing reuse.

## Quick Start

### Application Authentication (Development)

```typescript
import { createClientProvider, type ApplicationAuthRequest, type ClientFactory } from '@jhzhu89/azure-client-pool';

// Define your client factory
const clientFactory: ClientFactory<YourClient, YourOptions> = {
  async createClient(credential, options) {
    return new YourAzureClient(credential, options);
  },
  getClientFingerprint(options) {
    return `your-client-${options?.endpoint || 'default'}`;
  }
};

// Get authenticated client
const provider = await createClientProvider(clientFactory);
const client = await provider.getAuthenticatedClient({ mode: 'application' });
```

### Delegated Authentication (Production)

```typescript
import { type DelegatedAuthRequest } from '@jhzhu89/azure-client-pool';

const authRequest: DelegatedAuthRequest = {
  mode: 'delegated',
  userToken: 'user-jwt-token-from-request'
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
  userToken: string;
  endpoint: string;
}

// Map custom requests to auth requests and options
const requestMapper: RequestMapper<MyCustomRequest, { endpoint: string }> = {
  mapToAuthRequest: (request, authMode) => ({
    mode: 'delegated',
    userToken: request.userToken
  }),
  mapToOptions: (request) => ({ endpoint: request.endpoint })
};

// Create provider with mapper
const provider = await createClientProviderWithMapper(clientFactory, requestMapper);

// Use with your custom request format
const client = await provider.getAuthenticatedClient({
  userId: 'user123',
  userToken: 'jwt-token',
  endpoint: 'https://mycluster.kusto.windows.net'
});
```

## Configuration

### Application Mode
```bash
# `application` is the default auth mode
export AZURE_AUTH_MODE=application
```

### Delegated Mode
```bash
export AZURE_AUTH_MODE=delegated
export AZURE_CLIENT_ID=your-client-id
export AZURE_TENANT_ID=your-tenant-id
export AZURE_CLIENT_SECRET=your-client-secret
# OR
export AZURE_CLIENT_CERTIFICATE_PATH=/path/to/cert.pem
```

## When to Use Which Mode?

| Scenario | Use Application Mode | Use Delegated Mode |
|----------|---------------------|-------------------|
| Local development | ✅ Simple setup with `az login` | ❌ Requires additional config |
| Single-user apps | ✅ Direct Azure CLI integration | ❌ Unnecessary complexity |
| Multi-user web apps | ❌ No user context | ✅ Proper user delegation |
| Production APIs | ❌ Requires Azure CLI on server | ✅ Standard OAuth2 flow |
| Calling Microsoft Graph | ⚠️ Limited to CLI user | ✅ Full user permissions |

## Installation

```bash
# Using Bun
bun add @jhzhu89/azure-client-pool

# Using npm
npm install @jhzhu89/azure-client-pool

# Using pnpm  
pnpm add @jhzhu89/azure-client-pool
```

## Architecture

This library provides:
- **ClientFactory pattern** for creating Azure SDK clients
- **Intelligent caching** with TTL and size limits
- **JWT validation** for delegated authentication
- **Request deduplication** to prevent concurrent token requests
- **TypeScript support** with full type safety

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

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

MIT License - see the [LICENSE](./LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/jhzhu89/azure-client-pool)
- [npm Package](https://www.npmjs.com/package/@jhzhu89/azure-client-pool)
- [Issues](https://github.com/jhzhu89/azure-client-pool/issues)
- [Changelog](./CHANGELOG.md)
