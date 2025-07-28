import { describe, it, expect } from "bun:test";
import {
  type RequestExtractor,
  type AuthStrategyResolver,
} from "../../../src/client-pool/request-extraction.js";
import { AuthMode } from "../../../src/types.js";

describe("AuthStrategyResolver", () => {
  it("should create application auth request when no assertion token provided", () => {
    const resolver: AuthStrategyResolver = (userAssertionToken) => {
      if (!userAssertionToken) {
        return { mode: AuthMode.Application };
      }
      return { mode: AuthMode.Delegated, userAssertionToken };
    };

    const authRequest = resolver(undefined);

    expect(authRequest.mode).toBe(AuthMode.Application);
    expect("userAssertionToken" in authRequest).toBe(false);
  });

  it("should create delegated auth request when assertion token provided", () => {
    const resolver: AuthStrategyResolver = (userAssertionToken) => {
      if (!userAssertionToken) {
        return { mode: AuthMode.Application };
      }
      return { mode: AuthMode.Delegated, userAssertionToken };
    };

    const authRequest = resolver("test-token");

    expect(authRequest.mode).toBe(AuthMode.Delegated);
    expect("userAssertionToken" in authRequest && authRequest.userAssertionToken).toBe("test-token");
  });

  it("should support composite auth strategy", () => {
    const resolver: AuthStrategyResolver = (userAssertionToken) => {
      if (!userAssertionToken) {
        return { mode: AuthMode.Application };
      }
      return { mode: AuthMode.Composite, userAssertionToken };
    };

    const authRequest = resolver("admin-token");

    expect(authRequest.mode).toBe(AuthMode.Composite);
    expect("userAssertionToken" in authRequest && authRequest.userAssertionToken).toBe("admin-token");
  });

  it("should handle null and undefined consistently", () => {
    const resolver: AuthStrategyResolver = (userAssertionToken) => {
      if (!userAssertionToken) {
        return { mode: AuthMode.Application };
      }
      return { mode: AuthMode.Delegated, userAssertionToken };
    };

    expect(resolver(null as any)).toEqual({ mode: AuthMode.Application });
    expect(resolver(undefined)).toEqual({ mode: AuthMode.Application });
  });

  it("should support conditional auth strategies based on token content", () => {
    const resolver: AuthStrategyResolver = (userAssertionToken) => {
      if (!userAssertionToken) {
        return { mode: AuthMode.Application };
      }

      if (userAssertionToken.includes("admin")) {
        return { mode: AuthMode.Composite, userAssertionToken };
      }

      return { mode: AuthMode.Delegated, userAssertionToken };
    };

    expect(resolver("admin-token").mode).toBe(AuthMode.Composite);
    expect(resolver("user-token").mode).toBe(AuthMode.Delegated);
  });
});

describe("RequestExtractor interface", () => {
  it("should define correct interface with required extractAssertionToken method", () => {
    interface TestExtractor
      extends RequestExtractor<{ test: string }, string> {}

    const extractor: TestExtractor = {
      extractAssertionToken: (source) => {
        return source.test === "hasToken" ? "test-token" : undefined;
      },
      extractOptions: (source) => source.test,
    };

    const assertionToken = extractor.extractAssertionToken({ test: "hasToken" });
    expect(assertionToken).toBe("test-token");

    const options = extractor.extractOptions!({ test: "value" });
    expect(options).toBe("value");
  });

  it("should allow optional extractOptions method", () => {
    interface MinimalExtractor extends RequestExtractor<{ data: string }> {}

    const extractor: MinimalExtractor = {
      extractAssertionToken: (source) => {
        return source.data === "hasToken" ? "test-token" : undefined;
      },
    };

    expect(extractor.extractAssertionToken({ data: "hasToken" })).toBe("test-token");
    expect(extractor.extractAssertionToken({ data: "noToken" })).toBeUndefined();
  });

  it("should work with complex request types", () => {
    interface ComplexRequest {
      headers: Record<string, string>;
      body: { token?: string };
      options: { timeout: number };
    }

    interface ComplexOptions {
      timeout: number;
    }

    const extractor: RequestExtractor<ComplexRequest, ComplexOptions> = {
      extractAssertionToken: (source) => source.body.token || source.headers.authorization?.replace("Bearer ", ""),
      extractOptions: (source) => ({ timeout: source.options.timeout }),
    };

    const request: ComplexRequest = {
      headers: { authorization: "Bearer header-token" },
      body: { token: "body-token" },
      options: { timeout: 5000 },
    };

    expect(extractor.extractAssertionToken(request)).toBe("body-token");
    expect(extractor.extractOptions!(request)).toEqual({ timeout: 5000 });
  });

  it("should handle edge cases in token extraction", () => {
    const extractor: RequestExtractor<{ value?: number }> = {
      extractAssertionToken: () => undefined,
    };

    expect(extractor.extractAssertionToken({ value: 42 })).toBeUndefined();
    expect(extractor.extractAssertionToken({})).toBeUndefined();
  });
});

describe("Integration patterns", () => {
  it("should work together with resolver in typical usage", () => {
    const extractor: RequestExtractor<{ auth?: string }> = {
      extractAssertionToken: (source) => source.auth,
    };

    const resolver: AuthStrategyResolver = (userAssertionToken) => {
      if (!userAssertionToken) {
        return { mode: AuthMode.Application };
      }
      return { mode: AuthMode.Delegated, userAssertionToken };
    };

    const request1 = { auth: "user-token" };
    const assertionToken1 = extractor.extractAssertionToken(request1);
    const authRequest1 = resolver(assertionToken1);

    expect(authRequest1.mode).toBe(AuthMode.Delegated);
    expect("userAssertionToken" in authRequest1 && authRequest1.userAssertionToken).toBe("user-token");

    const request2 = {};
    const assertionToken2 = extractor.extractAssertionToken(request2);
    const authRequest2 = resolver(assertionToken2);

    expect(authRequest2.mode).toBe(AuthMode.Application);
  });

  it("should support different extraction strategies", () => {
    const headerExtractor: RequestExtractor<{ headers: Record<string, string> }> = {
      extractAssertionToken: (source) => source.headers.authorization?.replace("Bearer ", ""),
    };

    const bodyExtractor: RequestExtractor<{ body: { token?: string } }> = {
      extractAssertionToken: (source) => source.body.token,
    };

    expect(headerExtractor.extractAssertionToken({ 
      headers: { authorization: "Bearer abc123" } 
    })).toBe("abc123");

    expect(bodyExtractor.extractAssertionToken({ 
      body: { token: "xyz789" } 
    })).toBe("xyz789");
  });
});
