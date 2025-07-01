export interface AuthenticationRequest {
  readonly mode: "application" | "delegated";
}

export interface ApplicationAuthRequest extends AuthenticationRequest {
  readonly mode: "application";
}

export interface DelegatedAuthRequest extends AuthenticationRequest {
  readonly mode: "delegated";
  readonly accessToken: string;
}

export type AuthRequest = ApplicationAuthRequest | DelegatedAuthRequest;
