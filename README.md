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
import { createClientProvider, AuthMode, type AuthRequest, type ClientFactory } from '@jhzhu89/azure-client-pool';

// Define your client factory
const clientFactory: ClientFactory<YourClient, YourOptions> = {
  async createClient(credentialProvider, options) {
    const credential = await credentialProvider.getCredential(CredentialType.Application);
    return new YourAzureClient(credential, options);
  },
  getClientFingerprint(options) {
    return `your-client-${options?.endpoint || 'default'}`;
  }
};

// Create provider and get authenticated client
const provider = await createClientProvider(clientFactory);

const authRequest: AuthRequest = { mode: AuthMode.Application };
const client = await provider.getClient(authRequest);
```

### Delegated Authentication

```typescript
import { Identity } from '@jhzhu89/azure-jwt-middleware';

const identity = new Identity('user-access-token-from-oauth-flow', {
  oid: 'user-object-id',
  tid: 'tenant-id',
  exp: Math.floor(Date.now() / 1000) + 3600, // expiration timestamp
});

const authRequest: AuthRequest = {
  mode: AuthMode.Delegated,
  identity
};

const client = await provider.getClient(authRequest);
```

### Request-Aware Client Provider

For custom request formats, use `createRequestAwareClientProvider`:

```typescript
import { 
  createRequestAwareClientProvider, 
  IdentityExtractor, 
  type RequestExtractor,
  type AuthStrategyResolver
} from '@jhzhu89/azure-client-pool';

// Define your custom request format
interface MyCustomRequest extends Record<string, unknown> {
  userId: string;
  identity?: Identity;
  endpoint: string;
}

// Create custom extractor if needed, or use built-in IdentityExtractor
class CustomExtractor implements RequestExtractor<MyCustomRequest, { endpoint: string }> {
  extractIdentity(request: MyCustomRequest): Identity | undefined {
    return request.identity;
  }
  
  extractOptions(request: MyCustomRequest): { endpoint: string } {
    return { endpoint: request.endpoint };
  }
}

// Define auth strategy
const authResolver: AuthStrategyResolver = (identity?: Identity): AuthRequest => {
  if (!identity) {
    return { mode: AuthMode.Application };
  }
  return { mode: AuthMode.Delegated, identity };
};

// Create request-aware provider
const { getClient } = await createRequestAwareClientProvider(
  clientFactory,
  new CustomExtractor(),
  authResolver
);

// Use with your custom request format
const client = await getClient({
  userId: 'user123',
  identity: userIdentity,
  endpoint: 'https://mycluster.kusto.windows.net'
});
```
```

## Configuration

The library supports multiple configuration sources with automatic detection:

### Configuration Sources

- **Environment Variables** (default): Standard environment variable configuration
- **Azure App Configuration**: Centralized configuration service (when `AZURE_APPCONFIG_ENDPOINT` is set)

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

# Option 2: Certificate (file path)
export AZURE_CLIENT_CERTIFICATE_PATH=/path/to/cert.pem
export AZURE_CLIENT_CERTIFICATE_PASSWORD=cert-password

# Option 3: Certificate (base64 encoded)
export AZURE_CLIENT_CERTIFICATE_BASE64=base64-encoded-certificate
export AZURE_CLIENT_CERTIFICATE_PASSWORD=cert-password
```

### Advanced Configuration

Optional cache and JWT validation settings:

```bash
# Cache configuration
export CACHE_KEY_PREFIX=myapp
export CACHE_CLIENT_SLIDING_TTL=2700000  # 45 minutes
export CACHE_CLIENT_MAX_SIZE=100
export CACHE_CREDENTIAL_SLIDING_TTL=7200000  # 2 hours

# JWT validation
export JWT_AUDIENCE=your-expected-audience
export JWT_ISSUER=your-expected-issuer
export JWT_CLOCK_TOLERANCE=300  # 5 minutes
```

### Custom Configuration Source

You can provide a custom configuration source that returns the expected data structure:

```typescript
import { createClientProvider, type ConfigurationSource } from '@jhzhu89/azure-client-pool';

const customConfigSource: ConfigurationSource = {
  async load() {
    return {
      azure: {
        // Only required if you need delegated authentication
        clientId: 'your-client-id',
        tenantId: 'your-tenant-id',
        
        // Authentication credentials (for delegated auth only)
        clientSecret: 'your-client-secret',
        certificatePath: '/path/to/cert.pem',
        certificateBase64: 'base64-encoded-certificate',
        certificatePassword: 'cert-password',
        
        // Application auth configuration (optional, defaults work with Azure CLI/MI)
        managedIdentityClientId: 'your-managed-identity-client-id', // Optional
        applicationAuthStrategy: 'chain', // 'cli' | 'mi' | 'chain', defaults to 'chain'
      },
      jwt: {
        // All JWT settings are optional
        audience: 'expected-audience',
        issuer: 'expected-issuer',
        clockTolerance: 300, // seconds, defaults to 300
        cacheMaxAge: 86400000, // milliseconds, defaults to 24 hours
        jwksRequestsPerMinute: 10, // defaults to 10
      },
      cache: {
        // All cache settings are optional with sensible defaults
        keyPrefix: 'myapp', // defaults to 'client'
        clientCacheSlidingTtl: 2700000, // 45 minutes default
        clientCacheMaxSize: 100, // default
        clientCacheBufferMs: 60000, // 1 minute default
        credentialCacheSlidingTtl: 7200000, // 2 hours default
        credentialCacheMaxSize: 200, // default
        credentialCacheAbsoluteTtl: 28800000, // 8 hours default
      }
    };
  }
};

const provider = await createClientProvider(clientFactory, { 
  configSource: customConfigSource 
});
```

**Configuration Notes:**
- All configuration sections (`azure`, `jwt`, `cache`) are optional
- **Application authentication works out-of-the-box** using Azure CLI or Managed Identity credentials
- **Delegated authentication requires setup**: `clientId` and `tenantId` are required, plus at least one credential (`clientSecret`, `certificatePath`, or `certificateBase64`)
- JWT validation is only enabled for delegated authentication when `clientId` and `tenantId` are provided
- All cache and JWT settings have sensible defaults and can be omitted

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
- **Flexible configuration sources**: Environment variables and Azure App Configuration support
- **Intelligent caching**: Automatic client reuse with configurable TTL and size limits
- **JWT validation**: Built-in token validation for delegated authentication
- **Request deduplication**: Prevents concurrent duplicate requests
- **TypeScript support**: Full type safety and IntelliSense support
- **Flexible request mapping**: Support for custom request formats with optional configuration override

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
