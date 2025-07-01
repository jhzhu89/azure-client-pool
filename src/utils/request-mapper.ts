import {
  type AuthRequest,
  type ApplicationAuthRequest,
  type DelegatedAuthRequest,
} from "../types/auth-types.js";

export interface RequestMapper<TSource, TOptions = void> {
  mapToAuthRequest(
    source: TSource,
    mode: "application" | "delegated",
  ): AuthRequest;
  mapToOptions?(source: TSource): TOptions;
}

export class McpRequestMapper
  implements RequestMapper<Record<string, unknown>>
{
  mapToAuthRequest(
    request: Record<string, unknown>,
    mode: "application" | "delegated",
  ): AuthRequest {
    if (mode === "application") {
      return { mode: "application" } as ApplicationAuthRequest;
    } else {
      const params = request.params as Record<string, unknown> | undefined;
      const arguments_ = params?.arguments as
        | Record<string, unknown>
        | undefined;
      const accessToken = arguments_?.access_token as string | undefined;
      if (!accessToken) {
        throw new Error(
          "No access token provided in arguments. For delegated auth mode, you must provide 'access_token' in the tool arguments.",
        );
      }
      return { mode: "delegated", accessToken } as DelegatedAuthRequest;
    }
  }
}
