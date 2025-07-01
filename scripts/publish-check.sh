#!/bin/bash

# Azure Client Pool publish script
set -e

echo "Starting publish checks..."

# Clean environment
echo "Cleaning build directory..."
bun run clean

# Install dependencies
echo "Installing dependencies..."
bun install

# Type checking
echo "Running TypeScript type check..."
bun run typecheck

# Code quality check
echo "Running ESLint..."
bun run lint

# Run tests
echo "Running tests..."
bun test

# Build project
echo "Building project..."
bun run build

# Verify build artifacts
echo "Verifying build artifacts..."
if [ ! -f "dist/index.js" ]; then
    echo "CommonJS build failed"
    exit 1
fi

if [ ! -f "dist/index.mjs" ]; then
    echo "ESM build failed"
    exit 1
fi

if [ ! -f "dist/index.d.ts" ]; then
    echo "TypeScript declaration file generation failed"
    exit 1
fi

# Package size check
echo "Checking package size..."
PACKAGE_SIZE=$(du -sh dist | cut -f1)
echo "Build output size: $PACKAGE_SIZE"

# Node.js compatibility test
if command -v node &> /dev/null; then
    echo "Testing Node.js compatibility..."
    node -e "const pkg = require('./dist/index.js'); console.log('CommonJS load successful');"
    node -e "import('./dist/index.mjs').then(() => console.log('ESM load successful'));"
fi

echo "All checks passed! Ready to publish."
echo ""
echo "Publish commands:"
echo "  Beta version: bun publish --tag beta"
echo "  Release version: bun publish"
