/** Registration never caches authenticated Library requests or media. */
export async function registerBrowserPwa() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  try {
    await navigator.serviceWorker.register("/app-sw.js", { scope: "/" });
  } catch (error) {
    console.warn("Circé offline page could not be registered", error);
  }
}
