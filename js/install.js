// "Add to Home Screen" help.
//
// iOS Safari never shows an install prompt: the user has to use Share → Add to
// Home Screen, which is easy to miss. Chrome/Edge on Android and desktop fire
// `beforeinstallprompt`, which we keep so a button can trigger the prompt.

import { load, save } from './storage.js';

const DISMISS_KEY = 'ui.installDismissed';
let deferredPrompt = null;
let onChange = () => {};

export function initInstall(changed) {
  onChange = changed;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    onChange();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    save(DISMISS_KEY, true);
    onChange();
  });
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function installState() {
  const standalone = isStandalone();
  return {
    standalone,
    ios: isIos(),
    canPrompt: !!deferredPrompt,
    dismissed: !!load(DISMISS_KEY, false),
  };
}

/** Whether the dashboard should show the install banner. */
export function shouldShowBanner() {
  const s = installState();
  return !s.standalone && !s.dismissed && (s.ios || s.canPrompt);
}

export function dismissBanner() {
  save(DISMISS_KEY, true);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  onChange();
  return outcome === 'accepted';
}

/** Instructions as HTML for the current platform. */
export function installInstructions(shareIcon) {
  const s = installState();
  if (s.standalone) return 'PowerOn is installed and running as an app.';
  if (s.ios) {
    return `In Safari tap <strong>Share</strong> ${shareIcon} (on iOS 26 it sits behind the <strong>⋯</strong> button), scroll down and choose <strong>Add to Home Screen</strong>. Other iPhone browsers have the same option in their share menu.`;
  }
  if (s.canPrompt) return 'Tap <strong>Install app</strong> to add PowerOn to your home screen.';
  return 'Open the browser menu and choose <strong>Install app</strong> or <strong>Add to Home Screen</strong>.';
}
