import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { createJSONStorage, persist } from 'zustand/middleware'

const storedCount = (count: number, version = 0) =>
  JSON.stringify({ state: { count }, version })

describe('persist explicit undefined option behavior', () => {
  it('allows an explicit undefined merge to replace the default', async () => {
    const postRehydration = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
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
    )

    await expect(store.persist.rehydrate()).resolves.toBeUndefined()

    expect(store.getState()).toEqual({ count: 0 })
    expect(store.persist.hasHydrated()).toBe(false)
    expect(postRehydration).toHaveBeenCalledWith(undefined, expect.any(TypeError))
  })

  it('mutates state before an explicit undefined partialize throws', () => {
    const setItem = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        partialize: undefined,
        storage: createJSONStorage(() => ({
          getItem: () => null,
          setItem,
          removeItem: () => {},
        })),
      }),
    )

    expect(() => store.setState({ count: 1 })).toThrow(TypeError)
    expect(store.getState()).toEqual({ count: 1 })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('allows setOptions to replace merge with undefined', async () => {
    const postRehydration = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => storedCount(1),
          setItem: () => {},
          removeItem: () => {},
        })),
        onRehydrateStorage: () => postRehydration,
      }),
    )

    store.persist.setOptions({ merge: undefined })
    expect(store.persist.getOptions().merge).toBeUndefined()

    await expect(store.persist.rehydrate()).resolves.toBeUndefined()
    expect(store.getState()).toEqual({ count: 0 })
    expect(postRehydration).toHaveBeenCalledWith(undefined, expect.any(TypeError))
  })

  it('allows setOptions to replace partialize with undefined', () => {
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

    store.persist.setOptions({ partialize: undefined })
    expect(store.persist.getOptions().partialize).toBeUndefined()

    expect(() => store.setState({ count: 1 })).toThrow(TypeError)
    expect(store.getState()).toEqual({ count: 1 })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('reports undefined storage while continuing to use the old storage', async () => {
    let storedValue = storedCount(2)
    const getItem = vi.fn(() => storedValue)
    const setItem = vi.fn((_name: string, value: string) => {
      storedValue = value
    })
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem,
          setItem,
          removeItem: () => {},
        })),
      }),
    )

    store.persist.setOptions({ storage: undefined })
    expect(store.persist.getOptions().storage).toBeUndefined()

    store.setState({ count: 1 })
    expect(setItem).toHaveBeenCalledTimes(1)

    storedValue = storedCount(3)
    await store.persist.rehydrate()
    expect(getItem).toHaveBeenCalledTimes(1)
    expect(store.getState()).toEqual({ count: 3 })
  })

  it('allows setOptions to remove the default version from writes', () => {
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

    store.persist.setOptions({ version: undefined })
    expect(store.persist.getOptions().version).toBeUndefined()

    store.setState({ count: 1 })
    expect(setItem).toHaveBeenCalledWith(
      'test-storage',
      JSON.stringify({ state: { count: 1 } }),
    )
  })

  it('can intentionally remove an optional callback with undefined', async () => {
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

    store.persist.setOptions({ onRehydrateStorage: undefined })
    await store.persist.rehydrate()

    expect(onRehydrateStorage).not.toHaveBeenCalled()
    expect(store.getState()).toEqual({ count: 1 })
  })
})
