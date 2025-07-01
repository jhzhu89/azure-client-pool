# @jhzhu89/azure-client-pool

> Azure client lifecycle management with caching and authentication

[![npm version](https://badge.fury.io/js/%40jhzhu89%2Fazure-client-pool.svg)](https://badge.fury.io/js/%40jhzhu89%2Fazure-client-pool)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Client Caching**: Multi-layer caching with TTL management
- **Dual Authentication**: Application and Delegated authentication modes
- **Request Management**: Prevents duplicate token requests  
- **JWT Validation**: JWKS-based token validation with OBO flow support
- **TypeScript Support**: Full type safety and IntelliSense
- **Flexible Architecture**: Factory pattern for custom client implementations

## Installation

```bash
# Using Bun
bun add @jhzhu89/azure-client-pool

# Using npm
npm install @jhzhu89/azure-client-pool

# Using pnpm  
pnpm add @jhzhu89/azure-client-pool
```

## Quick Start

### Application Authentication

```typescript
import { createClientProvider, type ClientFactory, type ApplicationAuthRequest } from '@jhzhu89/azure-client-pool';

// Define your client factory
const clientFactory: ClientFactory<YourClient, YourOptions> = {
  async createClient(credential, options) {
    // Create and return your Azure SDK client
    return new YourAzureClient(credential, options);
  },
  getClientFingerprint(options) {
    return `your-client-${options?.endpoint || 'default'}`;
  }
};

// Create provider and get authenticated client
const provider = await createClientProvider(clientFactory);
const authRequest: ApplicationAuthRequest = { mode: 'application' };
const client = await provider.getAuthenticatedClient(authRequest);
```

### Delegated Authentication

```typescript
import { type DelegatedAuthRequest } from '@jhzhu89/azure-client-pool';

const authRequest: DelegatedAuthRequest = {
  mode: 'delegated',
  userToken: 'user-access-token'
};

const client = await provider.getAuthenticatedClient(authRequest);
```

## Core Components

### AuthenticatedClientProvider
High-level interface for creating and managing authenticated Azure clients with caching.

### Client Factories
Define how to create and identify your Azure SDK clients using the `ClientFactory` interface.

### Authentication Modes
- **Application**: Client credentials flow for service-to-service authentication
- **Delegated**: On-behalf-of flow for user-delegated authentication

### Request Mapping
Optional `RequestMapper` interface for transforming authentication requests.

## Architecture

```
@jhzhu89/azure-client-pool
├── managers/          # Client lifecycle management
├── providers/         # Authentication strategies  
├── validation/        # JWT token validation
├── config/           # Configuration management
├── types/            # TypeScript definitions
├── utils/            # Utilities and logging
└── injection/        # Dependency injection
```

## Examples

See the [examples](./examples) directory for complete usage patterns:

- [Application Authentication](./examples/application-auth.ts) - Service-to-service authentication

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
