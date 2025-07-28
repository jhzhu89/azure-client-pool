import { describe, it, expect, beforeEach, mock } from "bun:test";
import { CacheManager } from "../../../src/utils/cache.js";

// Mock disposable client for testing
class MockDisposableClient {
  public disposed = false;
  public disposeError: Error | null = null;

  constructor(public id: string) {}

  dispose() {
    if (this.disposeError) {
      throw this.disposeError;
    }
    this.disposed = true;
  }
}

// Mock non-disposable client
class MockClient {
  constructor(public id: string) {}
}

describe("CacheManager", () => {
  let cache: CacheManager<MockDisposableClient>;
  let factory: () => Promise<MockDisposableClient>;

  beforeEach(() => {
    cache = new CacheManager<MockDisposableClient>(
      { maxSize: 3, slidingTtl: 1000 },
      "test-cache"
    );
    factory = mock(async () => new MockDisposableClient(`client-${Date.now()}`));
  });

  describe("TTL Cache dispose behavior verification", () => {
    it("should call dispose when sliding TTL expires", async () => {
      const shortTtlCache = new CacheManager<MockDisposableClient>(
        { maxSize: 5, slidingTtl: 100 }, // 100ms TTL
        "short-ttl-cache"
      );

      const client = await shortTtlCache.getOrCreate("key1", async () => 
        new MockDisposableClient("client1")
      );

      expect(client.disposed).toBe(false);

      // Wait for sliding TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(client.disposed).toBe(true);
    });

    it("should handle immediate expiration when absoluteTtl is 0", async () => {
      const client1 = await cache.getOrCreate("key1", async () => 
        new MockDisposableClient("client1")
      );

      expect(client1.disposed).toBe(false);

      // Create an entry with absoluteTtl: 0 (should not be cached)
      const client2 = await cache.getOrCreate("key2", async () => 
        new MockDisposableClient("client2")
      , { absoluteTtl: 0 });

      // Client2 should be created but not cached due to absoluteTtl: 0
      expect(client2.id).toBe("client2");
      expect(cache.getStats().size).toBe(1); // Only client1 should be cached

      // Requesting key2 again should create a new instance
      const client3 = await cache.getOrCreate("key2", async () => 
        new MockDisposableClient("client3")
      );

      expect(client3.id).toBe("client3");
      expect(client3).not.toBe(client2);
      expect(cache.getStats().size).toBe(2); // Now both client1 and client3 are cached
    });

    it("should call dispose when cache reaches max size and evicts old items", async () => {
      const clients: MockDisposableClient[] = [];

      // Fill cache to max capacity (3 items)
      for (let i = 0; i < 3; i++) {
        const client = await cache.getOrCreate(`key${i}`, async () => 
          new MockDisposableClient(`client${i}`)
        );
        clients.push(client);
      }

      // All clients should be alive
      clients.forEach(client => expect(client.disposed).toBe(false));

      // Add one more item - should evict the oldest
      const client3 = await cache.getOrCreate("key3", async () => 
        new MockDisposableClient("client3")
      );

      // Wait for async disposal
      await new Promise(resolve => setTimeout(resolve, 10));

      // The first client should be disposed due to LRU eviction
      expect(clients[0].disposed).toBe(true);
      expect(clients[1].disposed).toBe(false);
      expect(clients[2].disposed).toBe(false);
      expect(client3.disposed).toBe(false);
    });
  });

  describe("Absolute TTL behavior", () => {
    it("should dispose when absolute TTL expires and entry is accessed", async () => {
      const client1 = await cache.getOrCreate("key1", async () => 
        new MockDisposableClient("client1"), {
        absoluteTtl: 100 // 100ms
      });

      expect(client1.disposed).toBe(false);

      // Wait for absolute TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Request same key again - should create new client and dispose old one
      const client2 = await cache.getOrCreate("key1", async () => 
        new MockDisposableClient("client2")
      );

      // Wait for async disposal
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(client1.disposed).toBe(true);
      expect(client2.disposed).toBe(false);
      expect(client1).not.toBe(client2);
    });

    it("should handle sliding TTL correctly when within absolute TTL", async () => {
      const client = await cache.getOrCreate("key1", async () => 
        new MockDisposableClient("long-lived"), {
        absoluteTtl: 2000 // 2 seconds
      });

      // Access within sliding TTL multiple times
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 150)); // 150ms intervals
        const sameClient = await cache.getOrCreate("key1", async () => 
          new MockDisposableClient("should-not-create")
        );
        expect(sameClient).toBe(client); // Should be same instance
      }

      expect(client.disposed).toBe(false);
    });

    it("should prioritize absolute TTL over sliding TTL", async () => {
      const client = await cache.getOrCreate("key1", async () => 
        new MockDisposableClient("short-absolute"), {
        absoluteTtl: 200 // Short absolute TTL
      });

      // Keep accessing to maintain sliding TTL
      await new Promise(resolve => setTimeout(resolve, 100));
      const sameClient1 = await cache.getOrCreate("key1", async () => 
        new MockDisposableClient("should-not-create")
      );
      expect(sameClient1).toBe(client);

      // Wait for absolute TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should create new client despite sliding TTL being active
      const newClient = await cache.getOrCreate("key1", async () => 
        new MockDisposableClient("new-after-absolute-expiry")
      );
      
      // Wait for disposal
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(client.disposed).toBe(true);
      expect(newClient).not.toBe(client);
    });
  });

  describe("Token-based cache scenarios", () => {
    it("should handle token expiration with buffer correctly", async () => {
      const now = Date.now();
      const tokenExpiresAt = now + 1000; // 1 second from now
      const bufferMs = 200; // 200ms buffer
      const effectiveTtl = 800; // 1000 - 200

      const client1 = await cache.getOrCreate("tokenKey", async () => 
        new MockDisposableClient("token-client-1"), {
        absoluteTtl: effectiveTtl
      });

      // Within effective TTL
      await new Promise(resolve => setTimeout(resolve, 500));
      const sameClient = await cache.getOrCreate("tokenKey", async () => 
        new MockDisposableClient("should-not-create")
      );
      expect(sameClient).toBe(client1);

      // After effective TTL but before actual token expiry
      await new Promise(resolve => setTimeout(resolve, 400));
      const newClient = await cache.getOrCreate("tokenKey", async () => 
        new MockDisposableClient("token-client-2")
      );
      
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(client1.disposed).toBe(true);
      expect(newClient).not.toBe(client1);
    });

    it("should handle zero TTL correctly for non-cached entries", async () => {
      // First, create an entry with absoluteTtl: 0 - should not be cached
      const client1 = await cache.getOrCreate("expiredToken", async () => 
        new MockDisposableClient("client1"), {
        absoluteTtl: 0
      });

      expect(client1.id).toBe("client1");
      expect(cache.getStats().size).toBe(0); // Should not be cached

      // Second call with same key should create new instance
      const client2 = await cache.getOrCreate("expiredToken", async () => 
        new MockDisposableClient("client2"), {
        absoluteTtl: 0
      });
      
      expect(client2.id).toBe("client2");
      expect(client2).not.toBe(client1);
      expect(cache.getStats().size).toBe(0); // Still not cached

      // Test negative TTL as well
      const client3 = await cache.getOrCreate("negativeToken", async () => 
        new MockDisposableClient("client3"), {
        absoluteTtl: -100
      });

      expect(client3.id).toBe("client3");
      expect(cache.getStats().size).toBe(0); // Should not be cached

      const client4 = await cache.getOrCreate("negativeToken", async () => 
        new MockDisposableClient("client4"), {
        absoluteTtl: -100
      });

      expect(client4.id).toBe("client4");
      expect(client4).not.toBe(client3);
      expect(cache.getStats().size).toBe(0); // Still not cached
    });
  });

  describe("Resource cleanup and error handling", () => {
    it("should handle dispose errors gracefully", async () => {
      const errorClient = new MockDisposableClient("error-client");
      errorClient.disposeError = new Error("Dispose failed");

      await cache.getOrCreate("errorKey", async () => errorClient);

      // Force expiry by creating entry with short TTL and waiting
      const newClient = await cache.getOrCreate("errorKey2", async () => 
        new MockDisposableClient("new-client"), {
        absoluteTtl: 1  // Very short TTL
      });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      // Request again to trigger disposal of expired entry
      const finalClient = await cache.getOrCreate("errorKey2", async () => 
        new MockDisposableClient("final-client")
      );

      expect(finalClient.id).toBe("final-client");
      expect(finalClient.disposed).toBe(false);
      expect(newClient.disposed).toBe(true);
    });

    it("should not attempt disposal on non-disposable objects", async () => {
      const cache2 = new CacheManager<MockClient>(
        { maxSize: 2, slidingTtl: 1000 },
        "test-cache-2"
      );

      const client1 = await cache2.getOrCreate("key1", async () => 
        new MockClient("client1")
      );

      // Create entry with short TTL
      const client2 = await cache2.getOrCreate("key2", async () => 
        new MockClient("client2"), {
        absoluteTtl: 1  // Very short TTL
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      // Request key2 again after expiry
      const client3 = await cache2.getOrCreate("key2", async () => 
        new MockClient("client3")
      );

      expect(client3.id).toBe("client3");
      expect(client1).not.toBe(client3);
      expect(client2).not.toBe(client3);
    });
  });

  describe("Cache statistics and state", () => {
    it("should maintain accurate cache statistics", async () => {
      expect(cache.getStats().size).toBe(0);

      const client1 = await cache.getOrCreate("key1", async () => 
        new MockDisposableClient("client1")
      );
      expect(cache.getStats().size).toBe(1);

      const client2 = await cache.getOrCreate("key2", async () => 
        new MockDisposableClient("client2")
      );
      expect(cache.getStats().size).toBe(2);

      // Create entry with absoluteTtl: 0 - should not be cached
      await cache.getOrCreate("key3", async () => 
        new MockDisposableClient("client3"), {
        absoluteTtl: 0
      });
      expect(cache.getStats().size).toBe(2); // Should still be 2

      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });

    it("should handle concurrent requests for same key", async () => {
      let factoryCallCount = 0;
      const testFactory = async () => {
        factoryCallCount++;
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async work
        return new MockDisposableClient(`client-${factoryCallCount}`);
      };

      // Start multiple concurrent requests
      const promises = [
        cache.getOrCreate("concurrentKey", testFactory),
        cache.getOrCreate("concurrentKey", testFactory),
        cache.getOrCreate("concurrentKey", testFactory)
      ];

      const results = await Promise.all(promises);

      // Should all return the same instance
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
      
      // Factory should only be called once
      expect(factoryCallCount).toBe(1);
    });
  });

  describe("Time precision edge cases", () => {
    it("should handle same millisecond absolute TTL expiry", async () => {
      // Test the edge case where Date.now() might return same value
      const client1 = await cache.getOrCreate("timeEdge", async () => 
        new MockDisposableClient("client1"), {
        absoluteTtl: 1 // Use 1ms instead of 0
      });

      // Force a slight delay to ensure time passes
      await new Promise(resolve => setTimeout(resolve, 2));

      const client2 = await cache.getOrCreate("timeEdge", async () => 
        new MockDisposableClient("client2")
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(client1.disposed).toBe(true);
      expect(client2).not.toBe(client1);
      expect(client2.id).toBe("client2");
    });

    it("should demonstrate the Date.now() precision issue", () => {
      const now1 = Date.now();
      const now2 = Date.now();
      const now3 = Date.now();
      
      console.log(`Time precision test: ${now1}, ${now2}, ${now3}`);
      console.log(`Same values: ${now1 === now2}, ${now2 === now3}`);
      
      // This test shows that consecutive Date.now() calls can return same value
    });
  });

  describe("Critical client cache scenarios", () => {
    it("should ensure old client is disposed when absolute TTL forces recreation", async () => {
      // Simulate a token-based client with specific TTL
      const mockClient1 = new MockDisposableClient("token-client-1");
      const mockClient2 = new MockDisposableClient("token-client-2");

      let creationCount = 0;
      const clientFactory = async () => {
        creationCount++;
        return creationCount === 1 ? mockClient1 : mockClient2;
      };

      // Create client with 200ms absolute TTL
      const client1 = await cache.getOrCreate("tokenClient", clientFactory, {
        absoluteTtl: 200
      });
      expect(client1).toBe(mockClient1);
      expect(mockClient1.disposed).toBe(false);

      // Wait for absolute TTL to expire
      await new Promise(resolve => setTimeout(resolve, 250));

      // Request again - should create new client and dispose old one
      const client2 = await cache.getOrCreate("tokenClient", clientFactory);
      expect(client2).toBe(mockClient2);

      // Wait for disposal
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(mockClient1.disposed).toBe(true);
      expect(mockClient2.disposed).toBe(false);
      expect(creationCount).toBe(2);
    });

    it("should handle sliding TTL adjustment when absolute TTL is shorter", async () => {
      // Test the logic where slidingTtl is adjusted to match absoluteTtl
      const longSlidingTtlCache = new CacheManager<MockDisposableClient>(
        { maxSize: 5, slidingTtl: 5000 }, // 5 second sliding TTL
        "long-sliding-cache"
      );

      const client = await longSlidingTtlCache.getOrCreate("shortAbsolute", 
        async () => new MockDisposableClient("short-absolute-client"), {
        absoluteTtl: 100 // 100ms absolute TTL (shorter than sliding)
      });

      expect(client.disposed).toBe(false);

      // Within 100ms, should still get same client
      await new Promise(resolve => setTimeout(resolve, 50));
      const sameClient = await longSlidingTtlCache.getOrCreate("shortAbsolute", 
        async () => new MockDisposableClient("should-not-create")
      );
      expect(sameClient).toBe(client);

      // After 100ms, should create new client
      await new Promise(resolve => setTimeout(resolve, 80));
      const newClient = await longSlidingTtlCache.getOrCreate("shortAbsolute", 
        async () => new MockDisposableClient("new-client")
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(client.disposed).toBe(true);
      expect(newClient).not.toBe(client);
    });
  });
});
