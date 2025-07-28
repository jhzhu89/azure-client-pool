# Azure Client Pool Examples

This directory contains comprehensive examples demonstrating all features of the azure-client-pool library.

## Examples Overview

### 1. `simple-application-auth.ts`
Basic application authentication with logging.
```bash
bun run examples/simple-application-auth.ts
```

### 2. `auth-example.ts`
Comprehensive authentication patterns including caching and error handling.
```bash
bun run examples/auth-example.ts
```

### 3. `delegated-auth.ts`
Delegated authentication using user tokens (OBO flow).
```bash
bun run examples/delegated-auth.ts
```

### 4. `composite-auth.ts`
Composite authentication supporting both application and delegated flows.
```bash
bun run examples/composite-auth.ts
```

### 5. `logging-example.ts`
Complete logging demonstrations with pino integration.
```bash
bun run examples/logging-example.ts
```

## Key Features Demonstrated

- **Multiple Authentication Strategies**: CLI, Managed Identity, Certificate/Secret
- **Intelligent Caching**: Context-aware client reuse
- **Request Mapping**: Custom request format support
- **Error Handling**: Comprehensive error scenarios
- **Logging Integration**: Built-in pino logger with custom configurations
- **TypeScript Support**: Full type safety examples

## Environment Setup

Most examples work out-of-the-box with Azure CLI authentication:

```bash
# Login with Azure CLI (for local development)
az login

# Or set environment variables for production
export AZURE_CLIENT_ID=your-client-id
export AZURE_CLIENT_SECRET=your-client-secret
export AZURE_TENANT_ID=your-tenant-id
```

## Running Examples

All examples include proper error handling and logging. You can run them individually or study the source code to understand implementation patterns.

Each example demonstrates specific aspects of the library while maintaining realistic usage scenarios.
