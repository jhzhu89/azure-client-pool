import { describe, it, expect, beforeEach } from "bun:test";
import {
  McpRequestMapper,
  type RequestMapper,
} from "../../../src/client-pool/request-mapper.js";

describe("McpRequestMapper", () => {
  let mapper: McpRequestMapper;

  beforeEach(() => {
    mapper = new McpRequestMapper();
  });

  describe("extractAuthData", () => {
    it("should extract access token from MCP request", () => {
      const request = {
        params: {
          arguments: {
            user_assertion: "test-access-token",
          },
        },
      };

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBe("test-access-token");
    });

    it("should return empty auth data when no access token is present", () => {
      const request = {};

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBeUndefined();
      expect(Object.keys(authData)).toHaveLength(0);
    });

    it("should handle missing params", () => {
      const request = {
        someOtherProp: "value",
      };

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBeUndefined();
    });

    it("should handle missing arguments", () => {
      const request = {
        params: {
          someOtherProp: "value",
        },
      };

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBeUndefined();
    });

    it("should ignore non-string access tokens", () => {
      const request = {
        params: {
          arguments: {
            user_assertion: 12345,
          },
        },
      };

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBeUndefined();
    });

    it("should handle boolean access token", () => {
      const request = {
        params: {
          arguments: {
            user_assertion: true,
          },
        },
      };

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBeUndefined();
    });

    it("should handle null or undefined access token", () => {
      const request = {
        params: {
          arguments: {
            user_assertion: null,
          },
        },
      };

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBeUndefined();
    });

    it("should handle nested request structures", () => {
      const request = {
        params: {
          arguments: {
            user_assertion: "nested-token",
            additional_data: {
              nested: "value",
            },
          },
          other_params: "value",
        },
        meta: {
          timestamp: Date.now(),
        },
      };

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBe("nested-token");
    });

    it("should handle non-object params gracefully", () => {
      const request = {
        params: "string-instead-of-object",
      };

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBeUndefined();
    });

    it("should handle non-object arguments gracefully", () => {
      const request = {
        params: {
          arguments: "string-instead-of-object",
        },
      };

      const authData = mapper.extractAuthData(request);

      expect(authData.userAssertion).toBeUndefined();
    });
  });

  describe("Real-world MCP Request Patterns", () => {
    it("should handle typical MCP tool call structure", () => {
      const mcpRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "azure_graph_users_list",
          arguments: {
            user_assertion: "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiI...",
            filter: "department eq 'Engineering'",
            select: "id,displayName,mail",
          },
        },
      };

      const authData = mapper.extractAuthData(mcpRequest);

      expect(authData.userAssertion).toBe(
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiI...",
      );
    });

    it("should handle MCP request without tool arguments", () => {
      const mcpRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "azure_graph_me",
        },
      };

      const authData = mapper.extractAuthData(mcpRequest);

      expect(authData.userAssertion).toBeUndefined();
    });

    it("should handle complex nested MCP request", () => {
      const mcpRequest = {
        jsonrpc: "2.0",
        id: 42,
        method: "tools/call",
        params: {
          name: "azure_complex_operation",
          arguments: {
            user_assertion: "user-specific-jwt-token",
            operation: {
              type: "batch",
              requests: [
                { method: "GET", url: "/users" },
                {
                  method: "POST",
                  url: "/groups",
                  body: { name: "Test Group" },
                },
              ],
            },
            options: {
              timeout: 30000,
              retries: 3,
            },
          },
        },
      };

      const authData = mapper.extractAuthData(mcpRequest);

      expect(authData.userAssertion).toBe("user-specific-jwt-token");
    });

    it("should handle empty arguments object", () => {
      const mcpRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "azure_tool",
          arguments: {},
        },
      };

      const authData = mapper.extractAuthData(mcpRequest);

      expect(authData.userAssertion).toBeUndefined();
    });

    it("should preserve additional auth data beyond access token", () => {
      const mcpRequest = {
        params: {
          arguments: {
            user_assertion: "token",
            custom_auth_data: "value",
            user_id: "123",
          },
        },
      };

      const authData = mapper.extractAuthData(mcpRequest);

      expect(authData.userAssertion).toBe("token");
      expect(Object.keys(authData)).toHaveLength(1);
    });
  });
});
