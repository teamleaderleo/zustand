import { describe, expect, it, vi } from 'vitest'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

const storedCount = (count: number, version = 0) =>
  JSON.stringify({ state: { count }, version })

// These assertions record current ownership; they do not select the final API policy.
describe('persist rehydrate observer settlement characterization', () => {
  it('records a throwing success callback as hydration failure before success publication', async () => {
    const callbackError = new Error('success callback failed')
    const completion = vi.fn(
      (state: { count: number } | undefined, error: unknown) => {
        if (state && error === undefined) {
          throw callbackError
        }
      },
    )
    const onFinishHydration = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => storedCount(1),
          setItem: () => {},
          removeItem: () => {},
        })),
        onRehydrateStorage: () => completion,
      }),
    )
    store.persist.onFinishHydration(onFinishHydration)

    await expect(store.persist.rehydrate()).rejects.toBe(callbackError)

    expect(store.getState()).toEqual({ count: 1 })
    expect(store.persist.hasHydrated()).toBe(false)
    expect(onFinishHydration).not.toHaveBeenCalled()
    expect(completion).toHaveBeenNthCalledWith(1, { count: 1 }, undefined)
    expect(completion).toHaveBeenNthCalledWith(2, undefined, callbackError)
  })

  it('records a throwing finish listener as failure after success publication', async () => {
    const listenerError = new Error('finish listener failed')
    const completion = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => storedCount(1),
          setItem: () => {},
          removeItem: () => {},
        })),
        onRehydrateStorage: () => completion,
      }),
    )
    store.persist.onFinishHydration(() => {
      throw listenerError
    })

    await expect(store.persist.rehydrate()).rejects.toBe(listenerError)

    expect(store.getState()).toEqual({ count: 1 })
    expect(store.persist.hasHydrated()).toBe(true)
    expect(completion).toHaveBeenNthCalledWith(1, { count: 1 }, undefined)
    expect(completion).toHaveBeenNthCalledWith(2, undefined, listenerError)
  })

  it('stops later finish listeners after an earlier listener throws', async () => {
    const listenerError = new Error('first finish listener failed')
    const laterListener = vi.fn()
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
    store.persist.onFinishHydration(() => {
      throw listenerError
    })
    store.persist.onFinishHydration(laterListener)

    await expect(store.persist.rehydrate()).rejects.toBe(listenerError)

    expect(store.persist.hasHydrated()).toBe(true)
    expect(laterListener).not.toHaveBeenCalled()
  })

  it('lets a throwing error callback replace the hydration source error', async () => {
    const sourceError = new Error('storage failed')
    const callbackError = new Error('error callback failed')
    const completion = vi.fn(
      (_state: { count: number } | undefined, error: unknown) => {
        if (error) {
          throw callbackError
        }
      },
    )
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: async () => {
            throw sourceError
          },
          setItem: async () => {},
          removeItem: async () => {},
        })),
        onRehydrateStorage: () => completion,
      }),
    )

    await expect(store.persist.rehydrate()).rejects.toBe(callbackError)

    expect(store.persist.hasHydrated()).toBe(false)
    expect(completion).toHaveBeenCalledWith(undefined, sourceError)
  })

  it('lets an error callback start a newer successful hydration while the older call rejects', async () => {
    const firstError = new Error('first read failed')
    let readCount = 0
    let newerHydration: Promise<void> | undefined
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: async () => {
            readCount += 1
            if (readCount === 1) {
              throw firstError
            }
            return storedCount(2)
          },
          setItem: async () => {},
          removeItem: async () => {},
        })),
        onRehydrateStorage: () => (_state, error) => {
          if (error) {
            newerHydration = Promise.resolve(store.persist.rehydrate())
          }
        },
      }),
    )

    await expect(store.persist.rehydrate()).rejects.toBe(firstError)
    expect(newerHydration).toBeDefined()
    await expect(newerHydration).resolves.toBeUndefined()

    expect(store.getState()).toEqual({ count: 2 })
    expect(store.persist.hasHydrated()).toBe(true)
  })

  it('preserves an asynchronous migration rejection as the source error', async () => {
    const migrationError = new Error('async migration failed')
    const completion = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        version: 2,
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => storedCount(1, 1),
          setItem: () => {},
          removeItem: () => {},
        })),
        migrate: async () => {
          throw migrationError
        },
        onRehydrateStorage: () => completion,
      }),
    )

    await expect(store.persist.rehydrate()).rejects.toBe(migrationError)

    expect(store.getState()).toEqual({ count: 0 })
    expect(store.persist.hasHydrated()).toBe(false)
    expect(completion).toHaveBeenCalledWith(undefined, migrationError)
  })
})
