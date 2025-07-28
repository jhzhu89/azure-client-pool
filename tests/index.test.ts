import { describe, test, expect } from "bun:test";

describe("Azure Client Pool", () => {
  test("should export main modules", async () => {
    const module = await import("../src/index.js");

    expect(typeof module.createClientProvider).toBe("function");
    expect(typeof module.setRootLogger).toBe("function");
    expect(typeof module.getLogger).toBe("function");
    expect(typeof module.AuthMode).toBe("object");
    expect(typeof module.CredentialType).toBe("object");
  });

  test("should have correct package structure", () => {
    const packageJson = require("../package.json");

    expect(packageJson.name).toBe("@jhzhu89/azure-client-pool");
    expect(packageJson.main).toBe("./dist/index.js");
    expect(packageJson.module).toBe("./dist/index.mjs");
  });

  test("module import should be fast", async () => {
    const start = performance.now();
    await import("../src/index.js");
    const end = performance.now();

    expect(end - start).toBeLessThan(100);
  });
});
