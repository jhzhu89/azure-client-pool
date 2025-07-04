import {
  type AuthRequest,
  type ApplicationAuthRequest,
  type DelegatedAuthRequest,
  type CompositeAuthRequest,
  AuthMode,
} from "../types.js";

export interface RequestMapper<TSource, TOptions = void> {
  mapToAuthRequest(source: TSource, mode: AuthMode): AuthRequest;
  mapToOptions?(source: TSource): TOptions;
}

export class McpRequestMapper
  implements RequestMapper<Record<string, unknown>>
{
  mapToAuthRequest(
    request: Record<string, unknown>,
    mode: AuthMode,
  ): AuthRequest {
    if (mode === AuthMode.Application) {
      return { mode: AuthMode.Application } as ApplicationAuthRequest;
    } else if (mode === AuthMode.Delegated) {
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
      return {
        mode: AuthMode.Delegated,
        accessToken,
      } as DelegatedAuthRequest;
    } else if (mode === AuthMode.Composite) {
      const params = request.params as Record<string, unknown> | undefined;
      const arguments_ = params?.arguments as
        | Record<string, unknown>
        | undefined;
      const accessToken = arguments_?.access_token as string | undefined;
      if (!accessToken) {
        throw new Error(
          "No access token provided in arguments. For composite auth mode, you must provide 'access_token' in the tool arguments.",
        );
      }
      return {
        mode: AuthMode.Composite,
        accessToken,
      } as CompositeAuthRequest;
    } else {
      throw new Error(`Unknown auth mode: ${mode}`);
    }
  }
}
