import type { AuthRequest } from "../types.js";
import { type Identity } from "@jhzhu89/jwt-validator";

export type AuthStrategyResolver = (identity?: Identity) => AuthRequest;

export interface RequestExtractor<
  TSource extends Record<string, unknown>,
  TOptions = void,
> {
  extractIdentity(source: TSource): Identity | undefined;
  extractOptions?(source: TSource): TOptions;
}

export class IdentityExtractor
  implements RequestExtractor<Record<string, unknown>>
{
  extractIdentity(request: Record<string, unknown>): Identity | undefined {
    if (
      request.identity &&
      typeof request.identity === "object" &&
      request.identity !== null &&
      !Array.isArray(request.identity)
    ) {
      return request.identity as Identity;
    }

    return undefined;
  }
}
