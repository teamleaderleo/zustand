#!/usr/bin/env python3
"""Apply the Fieldwork persist option ordering compatibility candidate."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def replace_exact(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one source anchor, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def main() -> None:
    source = ROOT / "src" / "middleware" / "persist.ts"
    tests = ROOT / "tests" / "persistUndefinedOptions.test.ts"

    replace_exact(
        source,
        '''  let options = {
    ...restOptions,
    storage: initialStorage,
    partialize,
    version,
    merge,
  }
''',
        '''  let options = {
    storage: initialStorage,
    partialize,
    version,
    merge,
    ...restOptions,
  }
''',
        "persist construction key order",
    )

    replace_exact(
        tests,
        '''import {
  createJSONStorage,
  persist,
  type PersistOptions,
} from 'zustand/middleware'
''',
        '''import {
  type PersistOptions,
  createJSONStorage,
  persist,
} from 'zustand/middleware'
''',
        "persist test import ordering",
    )

    text = tests.read_text(encoding="utf-8")
    if "preserves the historical construction option key order" in text:
        raise SystemExit("compatibility regressions already present")
    marker = "\n})\n"
    if not text.endswith(marker):
        raise SystemExit("persist test suite closing anchor mismatch")

    addition = r'''

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
'''
    tests.write_text(text[: -len(marker)] + addition + marker, encoding="utf-8")


if __name__ == "__main__":
    main()
