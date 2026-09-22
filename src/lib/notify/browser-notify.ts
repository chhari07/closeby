"use client";

/**
 * Thin wrapper around the Web Notification API so order alerts still reach
 * an owner or buyer who has switched away to another tab or app — sound and
 * in-page toasts only fire while the tab is focused and visible.
 */

/** Ask once; a prior "granted"/"denied" answer is remembered by the browser. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

export function showBrowserNotification(
  title: string,
  body: string,
  opts?: { tag?: string; onClick?: () => void },
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // A backgrounded/minimized tab is exactly when this matters most — skip it
  // only while the tab is already the one in front of the person.
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    const n = new Notification(title, {
      body,
      icon: "/icon.png",
      tag: opts?.tag,
    });
    n.onclick = () => {
      window.focus();
      opts?.onClick?.();
      n.close();
    };
  } catch {
    // Notification construction can throw on some platforms (e.g. iOS Safari
    // PWA without a service worker) — the toast + sound already covered it.
  }
}
