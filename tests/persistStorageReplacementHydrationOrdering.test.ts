import { describe, expect, it, vi } from 'vitest'
import { persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('persist storage replacement hydration ordering', () => {
  it('applies an old-storage read after storage replacement', async () => {
    const oldValue = deferred<
      | {
          state: { count: number }
          version: number
        }
      | null
    >()
    const newGetItem = vi.fn(() => ({ state: { count: 2 }, version: 0 }))
    const store = createStore(
      persist(
        () => ({ count: 0 }),
        {
          name: 'test-storage',
          skipHydration: true,
          storage: {
            getItem: () => oldValue.promise,
            removeItem: () => {},
            setItem: () => {},
          },
        },
      ),
    )

    const hydration = store.persist.rehydrate()
    store.persist.setOptions({
      storage: {
        getItem: newGetItem,
        removeItem: () => {},
        setItem: () => {},
      },
    })
    oldValue.resolve({ state: { count: 1 }, version: 0 })
    await hydration

    expect(store.getState().count).toBe(1)
    expect(newGetItem).not.toHaveBeenCalled()
  })

  it('writes an old-storage migration into the replacement storage', async () => {
    const migratedValue = deferred<{ count: number }>()
    const replacementSetItem = vi.fn()
    const store = createStore(
      persist(
        () => ({ count: 0 }),
        {
          migrate: () => migratedValue.promise,
          name: 'test-storage',
          skipHydration: true,
          storage: {
            getItem: () => ({ state: { count: 1 }, version: 1 }),
            removeItem: () => {},
            setItem: () => {},
          },
          version: 2,
        },
      ),
    )

    const hydration = store.persist.rehydrate()
    store.persist.setOptions({
      storage: {
        getItem: () => ({ state: { count: 3 }, version: 2 }),
        removeItem: () => {},
        setItem: replacementSetItem,
      },
    })
    migratedValue.resolve({ count: 2 })
    await hydration

    expect(store.getState().count).toBe(2)
    expect(replacementSetItem).toHaveBeenCalledWith('test-storage', {
      state: { count: 2 },
      version: 2,
    })
  })

  it('uses the replacement storage for a later hydration', async () => {
    const oldValue = deferred<
      | {
          state: { count: number }
          version: number
        }
      | null
    >()
    const newGetItem = vi.fn(() => ({ state: { count: 2 }, version: 0 }))
    const store = createStore(
      persist(
        () => ({ count: 0 }),
        {
          name: 'test-storage',
          skipHydration: true,
          storage: {
            getItem: () => oldValue.promise,
            removeItem: () => {},
            setItem: () => {},
          },
        },
      ),
    )

    const oldHydration = store.persist.rehydrate()
    store.persist.setOptions({
      storage: {
        getItem: newGetItem,
        removeItem: () => {},
        setItem: () => {},
      },
    })
    oldValue.resolve({ state: { count: 1 }, version: 0 })
    await oldHydration
    expect(store.getState().count).toBe(1)

    await store.persist.rehydrate()
    expect(store.getState().count).toBe(2)
    expect(newGetItem).toHaveBeenCalledTimes(1)
  })
})
