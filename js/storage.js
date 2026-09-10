// Thin, defensive wrapper around localStorage.
// Every call is wrapped in try/catch so the app keeps working when storage is
// unavailable (private mode, quota exceeded, blocked site data).

const PREFIX = 'poweron.';

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

/** All stored keys (without prefix) that start with the given sub-prefix. */
export function keysWithPrefix(subPrefix) {
  const result = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + subPrefix)) {
        result.push(k.slice(PREFIX.length));
      }
    }
  } catch {
    // ignore
  }
  return result;
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // ignore
  }
  return false;
}
