# App and PWA (`PWA`)

### PWA-01 · Manifest
**Status:** Implemented · **Priority:** Must · **Verify:** check

The app MUST ship a manifest with name, short name, `standalone` display, portrait
orientation, theme and background colour, relative `start_url` and `scope`, and
icons: SVG, 192, 512 and a maskable 512. Every icon file must exist.

### PWA-02 · Service worker
**Status:** Implemented · **Priority:** Must · **Verify:** check

A service worker MUST make the app usable offline.

- All app files are precached under a versioned cache name.
- Same-origin GET requests are network-first and revalidated with the server, so
  updates arrive quickly; the cache answers when the network fails.
- Navigations fall back to `index.html`.
- Old caches are deleted on activation.
- API requests to other origins are not intercepted.

### PWA-03 · Release discipline
**Status:** Implemented · **Priority:** Must · **Verify:** check

Every release that changes app files MUST bump the cache version, and every
`js/*.js` file MUST be listed in the precache list. `dev/spec-check.py` verifies
the list.

### PWA-04 · Install help
**Status:** Implemented · **Priority:** Should · **Verify:** manual

Because iOS Safari never offers installation by itself, the app MUST explain it.

- A dismissible banner appears when the app is not already installed and either
  the browser offers an install prompt or the device is iOS.
- On iOS the text points at Share → Add to Home Screen, including the ⋯ menu on
  iOS 26. Where the browser supports it, an Install button triggers the prompt.
- The same explanation is always available under Settings.

### PWA-05 · Feels like an app
**Status:** Implemented · **Priority:** Must · **Verify:** manual

Standalone display, safe-area padding for notches, Apple touch icon and title,
theme colour matching the theme, no browser chrome inside the app.

### PWA-06 · Persistent storage
**Status:** Implemented · **Priority:** Could · **Verify:** review

The app MUST ask the browser to keep its data (`navigator.storage.persist`) so
history is not evicted under storage pressure.
