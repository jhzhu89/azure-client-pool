import type { AuthRequest } from "../types.js";

export type AuthRequestFactory = (
  authData: {
    userAssertion?: string;
  } & Record<string, unknown>,
) => AuthRequest;

export interface RequestMapper<TSource, TOptions = void> {
  extractAuthData(source: TSource): {
    userAssertion?: string;
  } & Record<string, unknown>;
  extractOptions?(source: TSource): TOptions;
}
export class McpRequestMapper
  implements RequestMapper<Record<string, unknown>>
{
  extractAuthData(request: Record<string, unknown>): {
    userAssertion?: string;
  } & Record<string, unknown> {
    const params = request.params as Record<string, unknown> | undefined;
    const arguments_ = params?.arguments as Record<string, unknown> | undefined;

    const authData: { userAssertion?: string } & Record<string, unknown> = {};

    if (
      arguments_?.user_assertion &&
      typeof arguments_.user_assertion === "string"
    ) {
      authData.userAssertion = arguments_.user_assertion;
    }

    return authData;
  }
}
