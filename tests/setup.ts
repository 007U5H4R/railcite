import '@testing-library/jest-dom/vitest';

// Node 22+ ships an experimental, unconfigured global `localStorage` that resolves to
// `undefined` unless the process is started with --localstorage-file (see `node --help`).
// Vitest's jsdom-environment installer only copies a jsdom global onto `globalThis` when
// that key isn't already present there (see getWindowKeys/populateGlobal in
// node_modules/vitest/dist/chunks/index.DC7d2Pf8.js — "localStorage" is absent from its
// hardcoded override allowlist), so Node's broken accessor silently shadows jsdom's real
// one in every `// @vitest-environment jsdom` test. Patch in a minimal in-memory
// implementation so `localStorage` actually works under test. No-op if a future
// vitest/Node fixes this upstream.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.setItem !== 'function') {
  class MemoryStorage {
    private store = new Map<string, string>();
    get length() { return this.store.size; }
    clear() { this.store.clear(); }
    getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
    key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
    removeItem(key: string) { this.store.delete(key); }
    setItem(key: string, value: string) { this.store.set(key, String(value)); }
  }
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
}
