import { describe, expect, it, vi } from "vitest";
import { persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe("persist clear-storage hydration generation", () => {
  it("keeps a cleared delayed stored value from hydrating state", async () => {
    const storedValue = deferred<{
      state: { count: number };
      version: number;
    } | null>();
    const removeItem = vi.fn();
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: "test-storage",
        skipHydration: true,
        storage: {
          getItem: () => storedValue.promise,
          removeItem,
          setItem: () => {},
        },
      }),
    );

    const hydration = store.persist.rehydrate();
    store.persist.clearStorage();
    storedValue.resolve({ state: { count: 1 }, version: 0 });
    await hydration;

    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(0);
  });

  it("keeps a cleared delayed migration from hydrating state", async () => {
    const migratedValue = deferred<{ count: number }>();
    const migrate = vi.fn(() => migratedValue.promise);
    const removeItem = vi.fn();
    const store = createStore(
      persist(() => ({ count: 0 }), {
        migrate,
        name: "test-storage",
        skipHydration: true,
        storage: {
          getItem: () => ({ state: { count: 1 }, version: 1 }),
          removeItem,
          setItem: () => {},
        },
        version: 2,
      }),
    );

    const hydration = store.persist.rehydrate();
    expect(migrate).toHaveBeenCalledWith({ count: 1 }, 1);
    store.persist.clearStorage();
    migratedValue.resolve({ count: 2 });
    await hydration;

    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(0);
  });

  it("revokes the active hydration even when storage removal throws", async () => {
    const olderValue = deferred<{
      state: { count: number };
      version: number;
    } | null>();
    const removeError = new Error("remove failed");
    let readCount = 0;
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: "test-storage",
        skipHydration: true,
        storage: {
          getItem: () => {
            readCount += 1;
            return readCount === 1
              ? olderValue.promise
              : { state: { count: 2 }, version: 0 };
          },
          removeItem: () => {
            throw removeError;
          },
          setItem: () => {},
        },
      }),
    );

    const olderHydration = store.persist.rehydrate();
    expect(() => store.persist.clearStorage()).toThrow(removeError);
    olderValue.resolve({ state: { count: 1 }, version: 0 });
    await olderHydration;

    expect(store.getState().count).toBe(0);

    await store.persist.rehydrate();
    expect(store.getState().count).toBe(2);
  });

  it("does not reset live state when clearing after hydration", async () => {
    const removeItem = vi.fn();
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: "test-storage",
        skipHydration: true,
        storage: {
          getItem: () => ({ state: { count: 1 }, version: 0 }),
          removeItem,
          setItem: () => {},
        },
      }),
    );

    await store.persist.rehydrate();
    store.persist.clearStorage();

    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(store.getState().count).toBe(1);
  });

  it("allows a later hydration after clearing an older one", async () => {
    const olderValue = deferred<{
      state: { count: number };
      version: number;
    } | null>();
    let readCount = 0;
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: "test-storage",
        skipHydration: true,
        storage: {
          getItem: () => {
            readCount += 1;
            return readCount === 1
              ? olderValue.promise
              : { state: { count: 2 }, version: 0 };
          },
          removeItem: () => {},
          setItem: () => {},
        },
      }),
    );

    const olderHydration = store.persist.rehydrate();
    store.persist.clearStorage();
    olderValue.resolve({ state: { count: 1 }, version: 0 });
    await olderHydration;
    expect(store.getState().count).toBe(0);

    await store.persist.rehydrate();
    expect(store.getState().count).toBe(2);
  });
});