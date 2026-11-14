/**
 * Both surfaces restore the Library's last path on load (the browser only when
 * its address is "/"), so the helper records it before reloading the renderer.
 */
exports.createNavigation = ({ run, waitFor, click }) => {
  const navigate = async (path, ready) => {
    await run(
      `(() => { window.__e2eNavigating = true; const path = ${JSON.stringify(path)}; setTimeout(() => { localStorage.setItem('pond:lastPath:' + window.pond.libraryId(), path); if (document.documentElement.dataset.runtime === 'browser') location.assign(path); else location.reload(); }, 0); return true; })()`,
    );
    await waitFor(
      `!window.__e2eNavigating && Boolean(window.pond && document.querySelector('[data-slot=window]')) && Boolean(${ready})`,
      30000,
    );
  };
  /** Marks the first element whose text matches so the native pointer can click it. */
  const clickText = async (selector, text) => {
    const marker = `e2e-${Math.random().toString(36).slice(2)}`;
    await waitFor(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(node => node.textContent.trim().includes(${JSON.stringify(text)}))`,
    );
    await run(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(node => node.textContent.trim().includes(${JSON.stringify(text)})).setAttribute('data-e2e-target', ${JSON.stringify(marker)})`,
    );
    await click(`[data-e2e-target="${marker}"]`);
  };
  return { navigate, clickText };
};
