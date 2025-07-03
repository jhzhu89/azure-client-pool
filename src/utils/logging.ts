import { pino, type Logger as PinoLogger } from "pino";
import type { Logger } from "../types/logger.js";

function createPinoAdapter(pinoLogger: PinoLogger): Logger {
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      pinoLogger.debug(context, message),
    info: (message: string, context?: Record<string, unknown>) =>
      pinoLogger.info(context, message),
    warn: (message: string, context?: Record<string, unknown>) =>
      pinoLogger.warn(context, message),
    error: (message: string, context?: Record<string, unknown>) =>
      pinoLogger.error(context, message),
    child: (context: Record<string, unknown>) =>
      createPinoAdapter(pinoLogger.child(context)),
  };
}

let rootLogger: Logger;

function initializeLogger(): Logger {
  const pinoLogger = pino({
    level: process.env.LOG_LEVEL || "info",
    ...(process.env.NODE_ENV === "development" && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      },
    }),
  });

  return createPinoAdapter(pinoLogger);
}

function getRootLogger(): Logger {
  if (!rootLogger) {
    rootLogger = initializeLogger();
  }
  return rootLogger;
}

export function getLogger(component?: string): Logger {
  const logger = getRootLogger();
  return component ? logger.child?.({ component }) || logger : logger;
}

export function setRootLogger(logger: Logger): void {
  rootLogger = logger;
}
