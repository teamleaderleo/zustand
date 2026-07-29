import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { createJSONStorage, persist } from 'zustand/middleware'

describe('persist explicit rehydrate error settlement', () => {
  it('rejects an explicit asynchronous hydration failure', async () => {
    const error = new Error('storage failure')
    const postRehydration = vi.fn()
    const onHydrate = vi.fn()
    const onFinishHydration = vi.fn()

    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: async () => {
            throw error
          },
          setItem: async () => {},
          removeItem: async () => {},
        })),
        onRehydrateStorage: () => postRehydration,
      }),
    )

    store.persist.onHydrate(onHydrate)
    store.persist.onFinishHydration(onFinishHydration)

    await expect(store.persist.rehydrate()).rejects.toBe(error)

    expect(store.getState()).toEqual({ count: 0 })
    expect(store.persist.hasHydrated()).toBe(false)
    expect(onHydrate).toHaveBeenCalledOnce()
    expect(onFinishHydration).not.toHaveBeenCalled()
    expect(postRehydration).toHaveBeenCalledWith(undefined, error)
  })

  it('rejects an explicit synchronous parsing failure', async () => {
    const postRehydration = vi.fn()
    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => '{',
          setItem: () => {},
          removeItem: () => {},
        })),
        onRehydrateStorage: () => postRehydration,
      }),
    )

    await expect(store.persist.rehydrate()).rejects.toBeInstanceOf(SyntaxError)

    expect(store.getState()).toEqual({ count: 0 })
    expect(store.persist.hasHydrated()).toBe(false)
    expect(postRehydration).toHaveBeenCalledWith(
      undefined,
      expect.any(SyntaxError),
    )
  })

  it('continues to contain automatic hydration failures', () => {
    const postRehydration = vi.fn()

    expect(() =>
      createStore(
        persist(() => ({ count: 0 }), {
          name: 'test-storage',
          storage: createJSONStorage(() => ({
            getItem: () => '{',
            setItem: () => {},
            removeItem: () => {},
          })),
          onRehydrateStorage: () => postRehydration,
        }),
      ),
    ).not.toThrow()

    expect(postRehydration).toHaveBeenCalledWith(
      undefined,
      expect.any(SyntaxError),
    )
  })

  it('can recover after a rejected explicit hydration attempt', async () => {
    const firstError = new Error('first read failed')
    const postRehydration = vi.fn()
    const onFinishHydration = vi.fn()
    let failFirstRead = true

    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: async () => {
            if (failFirstRead) {
              throw firstError
            }
            return JSON.stringify({ state: { count: 42 }, version: 0 })
          },
          setItem: async () => {},
          removeItem: async () => {},
        })),
        onRehydrateStorage: () => postRehydration,
      }),
    )

    store.persist.onFinishHydration(onFinishHydration)

    await expect(store.persist.rehydrate()).rejects.toBe(firstError)
    expect(store.persist.hasHydrated()).toBe(false)
    expect(store.getState()).toEqual({ count: 0 })

    failFirstRead = false
    await expect(store.persist.rehydrate()).resolves.toBeUndefined()

    expect(store.persist.hasHydrated()).toBe(true)
    expect(store.getState()).toEqual({ count: 42 })
    expect(onFinishHydration).toHaveBeenCalledOnce()
    expect(onFinishHydration).toHaveBeenCalledWith({ count: 42 })
    expect(postRehydration).toHaveBeenNthCalledWith(
      1,
      undefined,
      firstError,
    )
    expect(postRehydration).toHaveBeenNthCalledWith(
      2,
      { count: 42 },
      undefined,
    )
  })

  it('continues to suppress errors from superseded attempts', async () => {
    const supersededError = new Error('superseded read failed')
    let rejectFirstRead: (reason: Error) => void = () => {}
    const firstRead = new Promise<string | null>((_resolve, reject) => {
      rejectFirstRead = reject
    })
    let readCount = 0

    const store = createStore(
      persist(() => ({ count: 0 }), {
        name: 'test-storage',
        skipHydration: true,
        storage: createJSONStorage(() => ({
          getItem: () => {
            readCount += 1
            return readCount === 1
              ? firstRead
              : Promise.resolve(
                  JSON.stringify({ state: { count: 2 }, version: 0 }),
                )
          },
          setItem: async () => {},
          removeItem: async () => {},
        })),
      }),
    )

    const superseded = store.persist.rehydrate()
    const current = store.persist.rehydrate()

    await expect(current).resolves.toBeUndefined()
    rejectFirstRead(supersededError)
    await expect(superseded).resolves.toBeUndefined()

    expect(store.persist.hasHydrated()).toBe(true)
    expect(store.getState()).toEqual({ count: 2 })
  })
})
