import { describe, it, expect, beforeEach } from "bun:test";
import {
  IdentityExtractor,
  type RequestExtractor,
  type AuthStrategyResolver,
} from "../../../src/client-pool/request-extraction.js";
import { Identity } from "@jhzhu89/jwt-validator";
import { AuthMode } from "../../../src/types.js";

describe("IdentityExtractor", () => {
  let extractor: IdentityExtractor;

  beforeEach(() => {
    extractor = new IdentityExtractor();
  });

  describe("extractIdentity", () => {
    it("should extract identity from request when present", () => {
      const identity = new Identity("test-token", {
        oid: "user-123",
        tid: "tenant-456",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const request = { identity };

      const extractedIdentity = extractor.extractIdentity(request);

      expect(extractedIdentity).toBe(identity);
    });

    it("should return undefined when identity is not present", () => {
      const request = { someOtherProp: "value" };

      const extractedIdentity = extractor.extractIdentity(request);

      expect(extractedIdentity).toBeUndefined();
    });

    it("should return undefined when identity is null", () => {
      const request = { identity: null };

      const extractedIdentity = extractor.extractIdentity(request);

      expect(extractedIdentity).toBeUndefined();
    });

    it("should return undefined when identity is not an object", () => {
      const request = { identity: "not-an-object" };

      const extractedIdentity = extractor.extractIdentity(request);

      expect(extractedIdentity).toBeUndefined();
    });

    it("should return undefined when identity is a number", () => {
      const request = { identity: 123 };

      const extractedIdentity = extractor.extractIdentity(request);

      expect(extractedIdentity).toBeUndefined();
    });

    it("should return undefined when identity is an array", () => {
      const request = { identity: [] };

      const extractedIdentity = extractor.extractIdentity(request);

      expect(extractedIdentity).toBeUndefined();
    });

    it("should handle empty request object", () => {
      const request = {};

      const extractedIdentity = extractor.extractIdentity(request);

      expect(extractedIdentity).toBeUndefined();
    });

    it("should handle request with nested identity property", () => {
      const identity = new Identity("nested-token", {
        oid: "nested-user",
        tid: "nested-tenant",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      const request = {
        data: {
          identity,
        },
        identity,
      };

      const extractedIdentity = extractor.extractIdentity(request);

      expect(extractedIdentity).toBe(identity);
    });
  });

  describe("extractOptions", () => {
    it("should be compatible with RequestExtractor interface", () => {
      // Test that IdentityExtractor can be used where RequestExtractor is expected
      const useExtractor = (ext: RequestExtractor<Record<string, unknown>>) => {
        return ext.extractIdentity({ test: "value" });
      };

      expect(() => useExtractor(extractor)).not.toThrow();
    });
  });
});

describe("AuthStrategyResolver", () => {
  it("should create application auth request when no identity provided", () => {
    const resolver: AuthStrategyResolver = (identity) => {
      if (!identity) {
        return { mode: AuthMode.Application };
      }
      return { mode: AuthMode.Delegated, identity };
    };

    const authRequest = resolver(undefined);

    expect(authRequest.mode).toBe(AuthMode.Application);
    expect("identity" in authRequest).toBe(false);
  });

  it("should create delegated auth request when identity provided", () => {
    const identity = new Identity("test-token", {
      oid: "user-123",
      tid: "tenant-456",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const resolver: AuthStrategyResolver = (identity) => {
      if (!identity) {
        return { mode: AuthMode.Application };
      }
      return { mode: AuthMode.Delegated, identity };
    };

    const authRequest = resolver(identity);

    expect(authRequest.mode).toBe(AuthMode.Delegated);
    expect("identity" in authRequest && authRequest.identity).toBe(identity);
  });

  it("should support composite auth strategy", () => {
    const identity = new Identity("test-token", {
      oid: "user-123",
      tid: "tenant-456",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const resolver: AuthStrategyResolver = (identity) => {
      if (!identity) {
        return { mode: AuthMode.Application };
      }
      return { mode: AuthMode.Composite, identity };
    };

    const authRequest = resolver(identity);

    expect(authRequest.mode).toBe(AuthMode.Composite);
    expect("identity" in authRequest && authRequest.identity).toBe(identity);
  });

  it("should handle different identity states consistently", () => {
    const resolver: AuthStrategyResolver = (identity) => {
      if (!identity) {
        return { mode: AuthMode.Application };
      }
      return { mode: AuthMode.Delegated, identity };
    };

    // Test with null
    expect(resolver(null as any)).toEqual({ mode: AuthMode.Application });

    // Test with undefined
    expect(resolver(undefined)).toEqual({ mode: AuthMode.Application });
  });

  it("should support conditional auth strategies based on identity properties", () => {
    const identity = new Identity("admin-token", {
      oid: "admin-123",
      tid: "tenant-456",
      exp: Math.floor(Date.now() / 1000) + 3600,
      roles: ["admin"],
    });

    const resolver: AuthStrategyResolver = (identity) => {
      if (!identity) {
        return { mode: AuthMode.Application };
      }

      // Conditional logic based on identity properties
      const roles = identity.payload.roles as string[] | undefined;
      if (roles?.includes("admin")) {
        return { mode: AuthMode.Composite, identity };
      }

      return { mode: AuthMode.Delegated, identity };
    };

    const authRequest = resolver(identity);

    expect(authRequest.mode).toBe(AuthMode.Composite);
    expect("identity" in authRequest && authRequest.identity).toBe(identity);
  });
});

describe("RequestExtractor interface", () => {
  it("should define correct interface with required extractIdentity method", () => {
    interface TestExtractor
      extends RequestExtractor<{ test: string }, string> {}

    const extractor: TestExtractor = {
      extractIdentity: (source) => {
        return new Identity("test", { oid: "test" });
      },
      extractOptions: (source) => {
        return source.test;
      },
    };

    const identity = extractor.extractIdentity({ test: "value" });
    const options = extractor.extractOptions!({ test: "value" });

    expect(identity).toBeDefined();
    expect(options).toBe("value");
  });

  it("should work with optional extractOptions method", () => {
    interface MinimalExtractor extends RequestExtractor<{ data: string }> {}

    const extractor: MinimalExtractor = {
      extractIdentity: (source) => {
        if (source.data === "hasIdentity") {
          return new Identity("test", { oid: "test" });
        }
        return undefined;
      },
    };

    expect(extractor.extractOptions).toBeUndefined();
    expect(extractor.extractIdentity({ data: "hasIdentity" })).toBeDefined();
    expect(extractor.extractIdentity({ data: "noIdentity" })).toBeUndefined();
  });

  it("should support complex source types", () => {
    interface ComplexRequest extends Record<string, unknown> {
      headers: Record<string, string>;
      body: { userId?: string };
      identity?: Identity;
    }

    interface ComplexOptions {
      userId: string;
      endpoint: string;
    }

    const extractor: RequestExtractor<ComplexRequest, ComplexOptions> = {
      extractIdentity: (source) => source.identity,
      extractOptions: (source) => ({
        userId: source.body.userId || "anonymous",
        endpoint: source.headers["x-endpoint"] || "default",
      }),
    };

    const identity = new Identity("complex-token", {
      oid: "complex-user",
      tid: "complex-tenant",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const request: ComplexRequest = {
      headers: { "x-endpoint": "custom-endpoint" },
      body: { userId: "user-456" },
      identity,
    };

    expect(extractor.extractIdentity(request)).toBe(identity);
    expect(extractor.extractOptions!(request)).toEqual({
      userId: "user-456",
      endpoint: "custom-endpoint",
    });
  });

  it("should handle edge cases in extractOptions", () => {
    const extractor: RequestExtractor<{ value?: number }, number> = {
      extractIdentity: () => undefined,
      extractOptions: (source) => source.value || 0,
    };

    expect(extractor.extractOptions!({})).toBe(0);
    expect(extractor.extractOptions!({ value: 42 })).toBe(42);
    expect(extractor.extractOptions!({ value: undefined })).toBe(0);
  });
});
