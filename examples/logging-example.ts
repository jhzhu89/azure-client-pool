import {
  createClientProvider,
  createClientProviderWithMapper,
  AuthMode,
  CredentialType,
  getLogger,
  setRootLogger,
  McpRequestMapper,
  type ClientFactory,
  type AuthRequestFactory,
  type Logger,
} from "@jhzhu89/azure-client-pool";
import { pino } from "pino";

// Example client that demonstrates comprehensive logging
interface LoggingDemoClient {
  performOperation(operationId: string): Promise<string>;
  handleError(): Promise<void>;
}

const loggingClientFactory: ClientFactory<LoggingDemoClient> = {
  async createClient(credentialProvider) {
    const logger = getLogger("logging-client-factory");
    
    logger.info("Creating new client instance");
    
    const credential = await credentialProvider.getCredential(
      CredentialType.Application,
    );
    
    logger.debug("Credential obtained", {
      credentialType: credential.constructor.name,
    });

    return {
      async performOperation(operationId: string) {
        const opLogger = logger.child ? logger.child({ operationId }) : logger;
        
        opLogger.info("Starting operation");
        opLogger.debug("Operation details", {
          timestamp: new Date().toISOString(),
          credentialUsed: credential.constructor.name,
        });

        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 100));
        
        opLogger.info("Operation completed successfully");
        return `Operation ${operationId} completed`;
      },

      async handleError() {
        const errorLogger = logger.child ? logger.child({ operation: "error-demo" }) : logger;
        
        errorLogger.warn("About to demonstrate error handling");
        
        try {
          throw new Error("Simulated error for demonstration");
        } catch (error) {
          errorLogger.error("Caught expected error", {
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          });
          
          // Re-throw for demonstration
          throw error;
        }
      },
    };
  },

  getClientFingerprint() {
    return "logging-demo-client";
  },
};

// Custom logger setup demonstration
function setupCustomLogger(): Logger {
  const customPinoLogger = pino({
    level: "debug",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "yyyy-mm-dd HH:MM:ss",
        ignore: "pid,hostname",
        messageFormat: "[{component}] {msg}",
      },
    },
  });

  // Create adapter for our Logger interface
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      customPinoLogger.debug(context, message),
    info: (message: string, context?: Record<string, unknown>) =>
      customPinoLogger.info(context, message),
    warn: (message: string, context?: Record<string, unknown>) =>
      customPinoLogger.warn(context, message),
    error: (message: string, context?: Record<string, unknown>) =>
      customPinoLogger.error(context, message),
    child: (context: Record<string, unknown>) => {
      const childPino = customPinoLogger.child(context);
      return {
        debug: (message: string, ctx?: Record<string, unknown>) =>
          childPino.debug(ctx, message),
        info: (message: string, ctx?: Record<string, unknown>) =>
          childPino.info(ctx, message),
        warn: (message: string, ctx?: Record<string, unknown>) =>
          childPino.warn(ctx, message),
        error: (message: string, ctx?: Record<string, unknown>) =>
          childPino.error(ctx, message),
      };
    },
  };
}

async function demonstrateBasicLogging() {
  const logger = getLogger("basic-demo");
  
  logger.info("=== Basic Logging Demonstration ===");
  
  const provider = await createClientProvider(loggingClientFactory);
  const client = await provider.getClient({ mode: AuthMode.Application });
  
  await client.performOperation("demo-op-1");
  await client.performOperation("demo-op-2");
  
  logger.info("Basic logging demo completed");
}

async function demonstrateErrorLogging() {
  const logger = getLogger("error-demo");
  
  logger.info("=== Error Logging Demonstration ===");
  
  try {
    const provider = await createClientProvider(loggingClientFactory);
    const client = await provider.getClient({ mode: AuthMode.Application });
    
    await client.handleError();
  } catch (error) {
    logger.info("Error was properly handled and logged");
  }
}

async function demonstrateCustomLogger() {
  const logger = getLogger("custom-logger-demo");
  
  logger.info("=== Custom Logger Demonstration ===");
  
  // Set up custom logger
  const customLogger = setupCustomLogger();
  setRootLogger(customLogger);
  
  // Now all subsequent getLogger calls will use the custom logger
  const newLogger = getLogger("with-custom-logger");
  newLogger.info("This message uses the custom logger setup");
  
  newLogger.debug("This debug message should be visible with custom config");
  
  newLogger.warn("Warning with custom formatting", {
    customField: "custom-value",
    timestamp: new Date().toISOString(),
  });
}

async function demonstrateMcpWithLogging() {
  const logger = getLogger("mcp-demo");
  
  logger.info("=== MCP Request Mapping with Logging ===");
  
  const createMcpAuthRequest: AuthRequestFactory = (authData) => {
    logger.debug("Creating auth request from MCP data", { authData });
    
    if (!authData.userAssertion) {
      logger.error("Missing user assertion in MCP request");
      throw new Error("User assertion is required");
    }
    
    return {
      mode: AuthMode.Delegated,
      userAssertion: authData.userAssertion,
    };
  };
  
  try {
    const { getClient } = await createClientProviderWithMapper(
      loggingClientFactory,
      new McpRequestMapper(),
      createMcpAuthRequest,
    );
    
    const mcpRequest = {
      method: "performOperation",
      params: {
        arguments: {
          user_assertion: "mock.jwt.token",
          operationId: "mcp-operation",
        },
      },
    };
    
    logger.info("Processing MCP request", { method: mcpRequest.method });
    
    const client = await getClient(mcpRequest);
    await client.performOperation("mcp-demo-operation");
    
    logger.info("MCP demonstration completed");
  } catch (error) {
    logger.error("MCP demonstration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main() {
  const logger = getLogger("logging-examples");
  
  logger.info("Starting comprehensive logging demonstrations...");
  
  try {
    await demonstrateBasicLogging();
    await demonstrateErrorLogging();
    await demonstrateCustomLogger();
    await demonstrateMcpWithLogging();
    
    logger.info("=== All logging demonstrations completed successfully! ===");
  } catch (error) {
    logger.error("Error during demonstrations:", error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { 
  main, 
  loggingClientFactory, 
  setupCustomLogger,
  demonstrateBasicLogging,
  demonstrateErrorLogging,
  demonstrateCustomLogger,
  demonstrateMcpWithLogging,
};
