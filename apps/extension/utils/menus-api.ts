/** Safari names the context-menu API `menus`, and WXT's polyfill does not alias `contextMenus` there. */
type MenuNamespace = typeof browser.contextMenus;

interface MenuHosts {
  contextMenus?: MenuNamespace;
  menus?: MenuNamespace;
}

function resolve(): MenuNamespace {
  /** SAFETY: both names come from the browser's own extension API and share one shape. */
  const runtime = globalThis.browser as MenuHosts | undefined;
  const menus = runtime?.contextMenus ?? runtime?.menus;
  if (!menus) {
    throw new Error("No context-menu API in this browser.");
  }
  return menus;
}

export const contextMenus: MenuNamespace = resolve();
