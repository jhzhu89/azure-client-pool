import type { AuthRequest } from "../types.js";

export type AuthStrategyResolver = (userAssertionToken?: string) => AuthRequest;

export interface RequestExtractor<TSource, TOptions = void> {
  extractAssertionToken(source: TSource): string | undefined;
  extractOptions?(source: TSource): TOptions;
}
