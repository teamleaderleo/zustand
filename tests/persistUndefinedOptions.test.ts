import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { createJSONStorage, persist } from 'zustand/middleware'

const storedCount = (count: number, version = 0) =>
  JSON.stringify({ state: { count }, version })

describe('persist explicit undefined option handling', () => {
  it('keeps default merge when construction supplies undefined', async () => {
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

    await store.persist.rehydrate()

    expect(store.getState()).toEqual({ count: 1 })
    expect(store.persist.hasHydrated()).toBe(true)
    expect(postRehydration).toHaveBeenCalledWith({ count: 1 }, undefined)
  })

  it('keeps default partialize when construction supplies undefined', () => {
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

    expect(() => store.setState({ count: 1 })).not.toThrow()
    expect(store.getState()).toEqual({ count: 1 })
    expect(setItem).toHaveBeenCalledWith(
      'test-storage',
      JSON.stringify({ state: { count: 1 }, version: 0 }),
    )
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

    store.persist.setOptions({ merge: undefined })

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

    store.persist.setOptions({ partialize: undefined })

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

    store.persist.setOptions({ storage: undefined })
    expect(store.persist.getOptions().storage).toBe(storage)

    store.setState({ count: 1 })
    expect(setItem).toHaveBeenCalledTimes(1)

    storedValue = storedCount(3)
    await store.persist.rehydrate()
    expect(getItem).toHaveBeenCalledTimes(1)
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

    store.persist.setOptions({ name: undefined })
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

    store.persist.setOptions({ version: undefined })
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

    store.persist.setOptions({ onRehydrateStorage: undefined })
    await store.persist.rehydrate()

    expect(onRehydrateStorage).not.toHaveBeenCalled()
    expect(store.getState()).toEqual({ count: 1 })
  })
})
