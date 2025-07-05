import type { AuthRequest } from "../types.js";

export type AuthRequestFactory = (
  authData: {
    accessToken?: string;
  } & Record<string, unknown>,
) => AuthRequest;

export interface RequestMapper<TSource, TOptions = void> {
  extractAuthData(source: TSource): {
    accessToken?: string;
  } & Record<string, unknown>;
  extractOptions?(source: TSource): TOptions;
}
export class McpRequestMapper
  implements RequestMapper<Record<string, unknown>>
{
  extractAuthData(request: Record<string, unknown>): {
    accessToken?: string;
  } & Record<string, unknown> {
    const params = request.params as Record<string, unknown> | undefined;
    const arguments_ = params?.arguments as Record<string, unknown> | undefined;

    const authData: { accessToken?: string } & Record<string, unknown> = {};

    if (
      arguments_?.access_token &&
      typeof arguments_.access_token === "string"
    ) {
      authData.accessToken = arguments_.access_token;
    }

    return authData;
  }
}
