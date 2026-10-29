/** Observe the replay engine's current documents and open shadow roots without polling. */
export function observeReplayLinks(input: {
  document: Document;
  visit(url: string): void;
  resolve(href: string): string | null;
}) {
  let disposed = false;
  let scheduled = false;
  let observed = new WeakSet<ParentNode>();
  let frames = new WeakSet<HTMLIFrameElement>();
  const observers: MutationObserver[] = [];
  const listeners: (() => void)[] = [];
  const definitions = new Set<string>();

  function scan(root: Document | ShadowRoot) {
    if (disposed) return;
    if (!observed.has(root)) {
      observed.add(root);
      const observer = new MutationObserver(() => scan(root));
      observer.observe(root, { childList: true, subtree: true });
      observers.push(observer);
      if (!("host" in root)) {
        const doc = root;
        /** SAFETY: each same-origin Document has its own standard DOM constructors. */
        const realm = doc.defaultView as
          | (Window & Pick<typeof globalThis, "HTMLAnchorElement">)
          | null;
        const click = (event: MouseEvent) => {
          if (!realm || event.defaultPrevented || event.button !== 0) return;
          const anchor = event
            .composedPath()
            .find(
              (node): node is HTMLAnchorElement =>
                node instanceof realm.HTMLAnchorElement,
            );
          const href = anchor?.getAttribute("href");
          if (!anchor || !href || href.startsWith("#")) return;
          const url = input.resolve(anchor.href);
          if (!url) return;
          event.preventDefault();
          input.visit(url);
        };
        doc.addEventListener("click", click);
        listeners.push(() => doc.removeEventListener("click", click));
      }
    }
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) scan(element.shadowRoot);
      const doc = element.ownerDocument;
      /** SAFETY: a same-origin document exposes its own standard iframe constructor. */
      const realm = doc.defaultView as
        | (Window & Pick<typeof globalThis, "HTMLIFrameElement">)
        | null;
      if (realm && element instanceof realm.HTMLIFrameElement) {
        if (!frames.has(element)) {
          frames.add(element);
          element.addEventListener("load", refresh);
          listeners.push(() => element.removeEventListener("load", refresh));
        }
        try {
          if (element.contentDocument) scan(element.contentDocument);
        } catch {
          // Cross-origin documents cannot participate in this read-only link bridge.
        }
      }
      if (
        element.localName.includes("-") &&
        !definitions.has(element.localName)
      ) {
        definitions.add(element.localName);
        void customElements.whenDefined(element.localName).then(refresh);
      }
    }
  }
  function disconnect() {
    for (const observer of observers.splice(0)) observer.disconnect();
    for (const off of listeners.splice(0)) off();
    observed = new WeakSet();
    frames = new WeakSet();
  }
  function refresh() {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (disposed) return;
      disconnect();
      scan(input.document);
    });
  }
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      disconnect();
    },
  };
}
