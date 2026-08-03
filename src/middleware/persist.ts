import type { StateCreator, StoreMutatorIdentifier } from '../vanilla.ts'

export interface StateStorage {
  getItem: (name: string) => string | null | Promise<string | null>
  setItem: (name: string, value: string) => unknown | Promise<unknown>
  removeItem: (name: string) => unknown | Promise<unknown>
}

export type StorageValue<S> = {
  state: S
  version?: number
}

export interface PersistStorage<S, R = unknown> {
  getItem: (name: string) => StorageValue<S> | null | Promise<StorageValue<S> | null>
  setItem: (name: string, value: StorageValue<S>) => R
  removeItem: (name: string) => R
}

type JsonStorageOptions = {
  reviver?: (key: string, value: unknown) => unknown
  replacer?: (key: string, value: unknown) => unknown
}

export function createJSONStorage<S>(
  getStorage: () => StateStorage,
  options?: JsonStorageOptions,
): PersistStorage<S> | undefined {
  let storage: StateStorage | undefined
  try {
    storage = getStorage()
  } catch {
    // prevent error if the storage is not defined (e.g. when server side rendering a page)
    return
  }
  const persistStorage: PersistStorage<S> = {
    getItem: (name) => {
      const parse = (str: string | null) => {
        if (str === null) {
          return null
        }
        return JSON.parse(str, options?.reviver) as StorageValue<S>
      }
      const str = (storage as StateStorage).getItem(name) ?? null
      if (str instanceof Promise) {
        return str.then(parse)
      }
      return parse(str)
    },
    setItem: (name, newValue) =>
      (storage as StateStorage).setItem(
        name,
        JSON.stringify(newValue, options?.replacer),
      ),
    removeItem: (name) => (storage as StateStorage).removeItem(name),
  }
  return persistStorage
}

export interface PersistOptions<S, PersistedState = S, PersistReturn = unknown> {
  /** Name of the storage (must be unique) */
  name: string
  /**
   * Use a custom persist storage.
   *
   * Combining `createJSONStorage` helps creating a persist storage
   * with JSON.parse and JSON.stringify.
   *
   * @default createJSONStorage(() => localStorage)
   */
  storage?: PersistStorage<PersistedState, PersistReturn> | undefined
  /**
   * Filter the persisted value.
   *
   * @params state The state's value
   */
  partialize?: (state: S) => PersistedState
  /**
   * A function returning another (optional) function.
   *
   * The main function will be called before the state rehydration.
   *
   * The returned function will be called after the state rehydration or when an error occurred.
   */
  onRehydrateStorage?: (
    state: S,
  ) => ((state?: S, error?: unknown) => void) | void
  /**
   * If the stored state's version mismatch the one specified here, the storage will not be used.
   * You can use the `migrate` function to handle breaking changes in order to persist previously stored data.
   */
  version?: number
  /**
   * A function to perform persisted state migration.
   * This function will be called when persisted state versions mismatch with the one specified here.
   */
  migrate?: (persistedState: unknown, version: number) => PersistedState | Promise<PersistedState>
  /**
   * A function to perform custom hydration merges when combining the stored state with the current one.
   * By default, this function does a shallow merge.
   */
  merge?: (persistedState: unknown, currentState: S) => S
  /**
   * An optional boolean that will prevent the persist middleware from triggering hydration on initialization,
   * This allows you to call `rehydrate()` at a specific point in your apps rendering life-cycle.
   *
   * This is useful in SSR application.
   *
   * @default false
   */
  skipHydration?: boolean
}

type PersistListener<S> = (state: S) => void

type StorePersist<S, Ps, Pr> = {
  persist: {
    setOptions: (options: Partial<PersistOptions<S, Ps, Pr>>) => void
    clearStorage: () => void
    rehydrate: () => Promise<void> | void
    hasHydrated: () => boolean
    onHydrate: (fn: PersistListener<S>) => () => void
    onFinishHydration: (fn: PersistListener<S>) => () => void
    getOptions: () => Partial<PersistOptions<S, Ps, Pr>>
  }
}

type PersistImpl = <T, U = T, Pr = unknown>(
  storeInitializer: StateCreator<T, [], []>,
  options: PersistOptions<T, U, Pr>,
) => StateCreator<T, [], []>

export const persistImpl: PersistImpl = (config, baseOptions) => (set, get, api) => {
  type S = ReturnType<typeof config>
  let options = {
    storage: createJSONStorage<S>(() => localStorage),
    partialize: (state: S) => state,
    version: 0,
    merge: (persistedState: unknown, currentState: S) => ({
      ...currentState,
      ...(persistedState as object),
    }),
    ...baseOptions,
  }

  let hasHydrated = false
  const hydrationListeners = new Set<PersistListener<S>>()
  const finishHydrationListeners = new Set<PersistListener<S>>()
  let storage = options.storage
  let hydrationVersion = 0

  if (!storage) {
    return config(
      (...args) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${options.name}', the given storage is currently unavailable.`,
        )
        set(...(args as Parameters<typeof set>))
      },
      get,
      api,
    )
  }

  const setItem = () => {
    const state = options.partialize({ ...get() })
    return (storage as PersistStorage<S>).setItem(options.name, {
      state,
      version: options.version,
    })
  }

  const savedSetState = api.setState

  api.setState = (state, replace) => {
    savedSetState(state, replace as any)
    void setItem()
  }

  const configResult = config(
    (...args) => {
      set(...(args as Parameters<typeof set>))
      void setItem()
    },
    get,
    api,
  )

  api.getInitialState = () => configResult

  // a workaround to solve the issue of not storing rehydrated state in sync storage
  // the set(state) value would be later overridden with initial state by create()
  // to avoid this, we merge the state from localStorage into the initial state.
  let stateFromStorage: S | undefined

  // to avoid race conditions with asynchronous hydration, hydrationVersion is incremented for each new hydration.
  // Only the latest hydration attempt is allowed to update state or call completion callbacks.
  const hydrate = () => {
    const currentVersion = ++hydrationVersion
    if (!storage) return

    hasHydrated = false
    hydrationListeners.forEach((cb) => cb(get() ?? configResult))

    const postRehydrationCallback =
      options.onRehydrateStorage?.(get() ?? configResult) || undefined

    // bind is used to avoid `TypeError: Illegal invocation` error
    return toThenable(storage.getItem.bind(storage))(options.name)
      .then((deserializedStorageValue) => {
        // Abort if a newer hydration has started
        if (currentVersion !== hydrationVersion) {
          return
        }
        if (deserializedStorageValue) {
          if (
            typeof deserializedStorageValue.version === 'number' &&
            deserializedStorageValue.version !== options.version
          ) {
            if (options.migrate) {
              const migration = options.migrate(
                deserializedStorageValue.state,
                deserializedStorageValue.version,
              )
              if (migration instanceof Promise) {
                return migration.then((result) => [true, result] as const)
              }
              return [true, migration] as const
            }
            console.error(
              `State loaded from storage couldn't be migrated since no migrate function was provided`,
            )
          } else {
            return [false, deserializedStorageValue.state] as const
          }
        }
        return [false, undefined] as const
      })
      .then((migrationResult) => {
        // Abort if a newer hydration has started
        if (currentVersion !== hydrationVersion) {
          return
        }
        const [migrated, migratedState] = migrationResult
        stateFromStorage = options.merge(
          migratedState as S,
          get() ?? configResult,
        )

        set(stateFromStorage as S, true)
        if (migrated) {
          return setItem()
        }
      })
      .then(() => {
        // Abort if a newer hydration has started
        if (currentVersion !== hydrationVersion) {
          return
        }
        postRehydrationCallback?.(get(), undefined)

        // It's possible that 'postRehydrationCallback' updated the state. To ensure
        // that isn't overwritten when returning 'stateFromStorage' below
        // (synchronous-case only), update 'stateFromStorage' to point to the latest
        // state. In the asynchronous case, 'stateFromStorage' isn't used after this
        // callback, so there's no harm in updating it to match the latest state.
        stateFromStorage = get()
        hasHydrated = true
        finishHydrationListeners.forEach((cb) => cb(stateFromStorage as S))
      })
      .catch((e: Error) => {
        // Abort if a newer hydration has started
        if (currentVersion !== hydrationVersion) {
          return
        }
        postRehydrationCallback?.(undefined, e)
      })
  }

  ;(api as StoreApi<S> & StorePersist<StoreApi<S>, S, unknown>).persist = {
    setOptions: (newOptions) => {
      options = {
        ...options,
        ...newOptions,
      }

      if (newOptions.storage && newOptions.storage !== storage) {
        hydrationVersion += 1
        storage = newOptions.storage
      }
    },
    clearStorage: () => {
      storage?.removeItem(options.name)
    },
    getOptions: () => options,
    rehydrate: () => hydrate() as Promise<void>,
    hasHydrated: () => hasHydrated,
    onHydrate: (cb) => {
      hydrationListeners.add(cb)

      return () => {
        hydrationListeners.delete(cb)
      }
    },
    onFinishHydration: (cb) => {
      finishHydrationListeners.add(cb)

      return () => {
        finishHydrationListeners.delete(cb)
      }
    },
  }

  if (!options.skipHydration) {
    hydrate()
  }

  return stateFromStorage || configResult
}

type Persist = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
  U = T,
  Pr = unknown,
>(
  initializer: StateCreator<T, [...Mps, ['zustand/persist', unknown]], Mcs>,
  options: PersistOptions<T, U, Pr>,
) => StateCreator<T, Mps, [['zustand/persist', U], ...Mcs]>

export const persist = persistImpl as unknown as Persist
