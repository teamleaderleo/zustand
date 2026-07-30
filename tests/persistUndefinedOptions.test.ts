import { describe, expect, it, vi } from 'vitest'
import {
  type PersistOptions,
  createJSONStorage,
  persist,
} from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

type CountState = { count: number }

// `exactOptionalPropertyTypes` deliberately rejects explicit `undefined` at the
// TypeScript API boundary. These regressions exercise JavaScript/runtime input,
// where callers and deserialized option objects can still contain those keys.
const runtimeOptions = (options: unknown) =>
  options as PersistOptions<CountState, unknown, unknown>
const runtimeUpdate = (options: unknown) =>
  options as Partial<PersistOptions<CountState, unknown, unknown>>

const storedCount = (count: number, version = 0) =>
  JSON.stringify({ state: { count }, version })

describe('persist explicit undefined option handling', () => {
  it('keeps default merge when construction supplies undefined', async () => {
    const postRehydration = vi.fn()
    const store = createStore(
      persist(
        () => ({ count: 0 }),
        runtimeOptions({
          name: 'test-storage',
          skipHydration: true,
          merge: undefined,
          storage: createJSONStorage(() => ({
            getItem: () => storedCount(1),
            setItem: () => {},
            removeItem: () => {},
          })),
          onRehydrateStorage: () => postRehydration,
        }),
      ),
    )

    await store.persist.rehydrate()

    expect(store.getState()).toEqual({ count: 1 })
    expect(store.persist.hasHydrated()).toBe(true)
    expect(postRehydration).toHaveBeenCalledWith({ count: 1 }, undefined)
  })

  it('keeps default partialize when construction supplies undefined', () => {
    const setItem = vi.fn()
    const store = createStore(
      persist(
        () => ({ count: 0 }),
        runtimeOptions({
          name: 'test-storage',
          skipHydration: true,
          partialize: undefined,
          storage: createJSONStorage(() => ({
            getItem: () => null,
            setItem,
            removeItem: () => {},
          })),
        }),
      ),
    )

    expect(() => store.setState({ count: 1 })).not.toThrow()
    expect(store.getState()).toEqual({ count: 1 })
    expect(setItem).toHaveBeenCalledWith(
      'test-storage',
      JSON.stringify({ state: { count: 1 }, version: 0 }),
    )
  })

  it('keeps the default version when construction supplies undefined', () => {
    const setItem = vi.fn()
    const store = createStore(
      persist(
        () => ({ count: 0 }),
        runtimeOptions({
          name: 'test-storage',
          skipHydration: true,
          version: undefined,
          storage: createJSONStorage(() => ({
            getItem: () => null,
            setItem,
            removeItem: () => {},
          })),
        }),
      ),
    )

    expect(store.persist.getOptions().version).toBe(0)
    store.setState({ count: 1 })
    expect(setItem).toHaveBeenCalledWith(
      'test-storage',
      JSON.stringify({ state: { count: 1 }, version: 0 }),
    )
  })

  it('keeps default browser storage when construction supplies undefined', () => {
    const localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    vi.stubGlobal('window', { localStorage })

    try {
      const store = createStore(
        persist(
          () => ({ count: 0 }),
          runtimeOptions({
            name: 'test-storage',
            skipHydration: true,
            storage: undefined,
          }),
        ),
      )

      expect(store.persist.getOptions().storage).toBeDefined()
      store.setState({ count: 1 })
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'test-storage',
        JSON.stringify({ state: { count: 1 }, version: 0 }),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('preserves merge when setOptions supplies undefined', async () => {
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => storedCount(1),
          setItem: () => {},
          removeItem: () => {},
        })),
      }),
    )
    const merge = store.persist.getOptions().merge

    store.persist.setOptions(runtimeUpdate({ merge: undefined }))

    expect(store.persist.getOptions().merge).toBe(merge)
    await store.persist.rehydrate()
    expect(store.getState()).toEqual({ count: 1 })
  })

  it('preserves partialize when setOptions supplies undefined', () => {
    const setItem = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => null,
          setItem,
          removeItem: () => {},
        })),
      }),
    )
    const partialize = store.persist.getOptions().partialize

    store.persist.setOptions(runtimeUpdate({ partialize: undefined }))

    expect(store.persist.getOptions().partialize).toBe(partialize)
    expect(() => store.setState({ count: 1 })).not.toThrow()
    expect(store.getState()).toEqual({ count: 1 })
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('keeps storage references aligned after an undefined update', async () => {
    let storedValue = storedCount(2)
    const getItem = vi.fn(() => storedValue)
    const setItem = vi.fn((_name: string, value: string) => {
      storedValue = value
    })
    const storage = createJSONStorage(() => ({
      getItem,
      setItem,
      removeItem: () => {},
    }))
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage,
      }),
    )

    store.persist.setOptions(runtimeUpdate({ storage: undefined }))
    expect(store.persist.getOptions().storage).toBe(storage)

    store.setState({ count: 1 })
    expect(setItem).toHaveBeenCalledTimes(1)

    storedValue = storedCount(3)
    await store.persist.rehydrate()
    expect(getItem).toHaveBeenCalledTimes(1)
    expect(store.getState()).toEqual({ count: 3 })
  })

  it('keeps public and private storage aligned after replacement', async () => {
    const initialGetItem = vi.fn(() => storedCount(1))
    const initialSetItem = vi.fn()
    const replacementGetItem = vi.fn(() => storedCount(3))
    const replacementSetItem = vi.fn()
    const initialStorage = createJSONStorage(() => ({
      getItem: initialGetItem,
      setItem: initialSetItem,
      removeItem: () => {},
    }))
    const replacementStorage = createJSONStorage(() => ({
      getItem: replacementGetItem,
      setItem: replacementSetItem,
      removeItem: () => {},
    }))
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: initialStorage,
      }),
    )

    store.persist.setOptions({ storage: replacementStorage })
    expect(store.persist.getOptions().storage).toBe(replacementStorage)

    store.setState({ count: 2 })
    expect(initialSetItem).not.toHaveBeenCalled()
    expect(replacementSetItem).toHaveBeenCalledTimes(1)

    await store.persist.rehydrate()
    expect(initialGetItem).not.toHaveBeenCalled()
    expect(replacementGetItem).toHaveBeenCalledTimes(1)
    expect(store.getState()).toEqual({ count: 3 })
  })

  it('preserves the storage name when setOptions supplies undefined', () => {
    const setItem = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => null,
          setItem,
          removeItem: () => {},
        })),
      }),
    )

    store.persist.setOptions(runtimeUpdate({ name: undefined }))
    expect(store.persist.getOptions().name).toBe('test-storage')

    store.setState({ count: 1 })
    expect(setItem).toHaveBeenCalledWith(
      'test-storage',
      JSON.stringify({ state: { count: 1 }, version: 0 }),
    )
  })

  it('preserves the default version when setOptions supplies undefined', () => {
    const setItem = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => null,
          setItem,
          removeItem: () => {},
        })),
      }),
    )

    store.persist.setOptions(runtimeUpdate({ version: undefined }))
    expect(store.persist.getOptions().version).toBe(0)

    store.setState({ count: 1 })
    expect(setItem).toHaveBeenCalledWith(
      'test-storage',
      JSON.stringify({ state: { count: 1 }, version: 0 }),
    )
  })

  it('can still remove an optional callback with undefined', async () => {
    const onRehydrateStorage = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => storedCount(1),
          setItem: () => {},
          removeItem: () => {},
        })),
        onRehydrateStorage,
      }),
    )

    store.persist.setOptions(runtimeUpdate({ onRehydrateStorage: undefined }))
    await store.persist.rehydrate()

    expect(onRehydrateStorage).not.toHaveBeenCalled()
    expect(store.getState()).toEqual({ count: 1 })
  })

  it('preserves the historical construction option key order', () => {
    const storage = createJSONStorage(() => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }))
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage,
      }),
    )

    expect(Object.keys(store.persist.getOptions())).toEqual([
      'storage',
      'partialize',
      'version',
      'merge',
      'name',
      'skipHydration',
    ])
  })

  it('preserves custom current values across undefined updates', () => {
    const storage = createJSONStorage(() => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }))
    const partialize = (state: CountState) => state
    const merge = (persistedState: unknown, currentState: CountState) => ({
      ...currentState,
      ...(persistedState as object),
    })
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'custom-storage',
        skipHydration: true,
        storage,
        partialize,
        version: 7,
        merge,
      }),
    )

    store.persist.setOptions(
      runtimeUpdate({
        name: undefined,
        storage: undefined,
        partialize: undefined,
        version: undefined,
        merge: undefined,
      }),
    )

    expect(store.persist.getOptions()).toMatchObject({
      name: 'custom-storage',
      storage,
      partialize,
      version: 7,
      merge,
    })
  })
})
