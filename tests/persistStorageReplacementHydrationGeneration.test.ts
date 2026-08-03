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

describe('persist storage replacement hydration generation', () => {
  it('keeps an old-storage read from hydrating after replacement', async () => {
    const oldValue = deferred<{
      state: { count: number }
      version: number
    } | null>()
    const newGetItem = vi.fn(() => ({ state: { count: 2 }, version: 0 }))
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: {
          getItem: () => oldValue.promise,
          removeItem: () => {},
          setItem: () => {},
        },
      }),
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

    expect(store.getState().count).toBe(0)
    expect(newGetItem).not.toHaveBeenCalled()
  })

  it('keeps an old-storage migration out of replacement storage', async () => {
    const migratedValue = deferred<{ count: number }>()
    const replacementSetItem = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        migrate: () => migratedValue.promise,
        name: 'test-storage',
        skipHydration: true,
        storage: {
          getItem: () => ({ state: { count: 1 }, version: 1 }),
          removeItem: () => {},
          setItem: () => {},
        },
        version: 2,
      }),
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

    expect(store.getState().count).toBe(0)
    expect(replacementSetItem).not.toHaveBeenCalled()
  })

  it('uses the replacement storage for a later hydration', async () => {
    const oldValue = deferred<{
      state: { count: number }
      version: number
    } | null>()
    const newGetItem = vi.fn(() => ({ state: { count: 2 }, version: 0 }))
    const postRehydrationCallback = vi.fn()
    const finishHydrationListener = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        onRehydrateStorage: () => postRehydrationCallback,
        skipHydration: true,
        storage: {
          getItem: () => oldValue.promise,
          removeItem: () => {},
          setItem: () => {},
        },
      }),
    )
    store.persist.onFinishHydration(finishHydrationListener)

    const oldHydration = store.persist.rehydrate()
    // Replacing storage invalidates this generation; it does not start a new one.
    store.persist.setOptions({
      storage: {
        getItem: newGetItem,
        removeItem: () => {},
        setItem: () => {},
      },
    })
    oldValue.resolve({ state: { count: 1 }, version: 0 })
    await oldHydration

    expect(store.getState().count).toBe(0)
    expect(store.persist.hasHydrated()).toBe(false)
    expect(postRehydrationCallback).not.toHaveBeenCalled()
    expect(finishHydrationListener).not.toHaveBeenCalled()

    await store.persist.rehydrate()

    expect(store.getState().count).toBe(2)
    expect(store.persist.hasHydrated()).toBe(true)
    expect(newGetItem).toHaveBeenCalledTimes(1)
    expect(postRehydrationCallback).toHaveBeenCalledOnce()
    expect(postRehydrationCallback).toHaveBeenCalledWith(
      { count: 2 },
      undefined,
    )
    expect(finishHydrationListener).toHaveBeenCalledOnce()
    expect(finishHydrationListener).toHaveBeenCalledWith({ count: 2 })
  })
})
