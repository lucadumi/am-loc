/** In-memory stand-in for AsyncStorage, so lib/reporters.ts can be tested off-device. */
const store = new Map<string, string>();

/** Test-only: keys whose writes reject, to stand in for a device that refuses. */
const failing = new Set<string>();

export default {
  async getItem(key: string) {
    return store.has(key) ? store.get(key)! : null;
  },
  async setItem(key: string, value: string) {
    if (failing.has(key)) throw new Error(`storage refused a write to ${key}`);
    store.set(key, value);
  },
  async removeItem(key: string) {
    store.delete(key);
  },
  async multiRemove(keys: string[]) {
    keys.forEach((key) => store.delete(key));
  },
  /** Test-only: reach in and corrupt a value. */
  __store: store,
  /** Test-only: make writes to these keys fail. */
  __failWrites: failing,
};
