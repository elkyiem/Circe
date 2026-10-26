import { act, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, expect, it, vi } from "vitest";
import { useOpenAtBottom } from "./chat-scroll";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

function setScrollGeometry(node: HTMLDivElement, height: number) {
  Object.defineProperties(node, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: height },
  });
}

let grow: (lines: number) => void = () => {};

function Conversation({ chatKey }: { chatKey: string }) {
  const openAtBottom = useOpenAtBottom();
  const [lines, setLines] = useState(1);
  grow = setLines;
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) setScrollGeometry(node, 500);
      openAtBottom(node);
    },
    [openAtBottom],
  );
  return (
    <div key={chatKey} data-chat={chatKey} ref={ref}>
      {Array.from({ length: lines }, (_, index) => (
        <p key={String(index)}>Line</p>
      ))}
    </div>
  );
}

function viewport(host: HTMLElement, chatKey: string) {
  const node = host.querySelector<HTMLDivElement>(`[data-chat="${chatKey}"]`);
  if (!node) throw new Error(`Missing ${chatKey}`);
  return node;
}

it("opens every chat at its latest message", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Conversation chatKey="long" />));
    expect(viewport(host, "long").scrollTop).toBe(500);
    viewport(host, "long").dispatchEvent(new Event("wheel"));
    viewport(host, "long").scrollTop = 40;

    await act(async () => root.render(<Conversation chatKey="short" />));
    await act(async () => root.render(<Conversation chatKey="long" />));
    expect(viewport(host, "long").scrollTop).toBe(500);
  } finally {
    await act(async () => root.unmount());
  }
});

it("stays at the bottom while history loads until the reader scrolls", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Conversation chatKey="chat" />));
    const node = viewport(host, "chat");
    setScrollGeometry(node, 900);
    await act(async () => grow(4));
    expect(node.scrollTop).toBe(900);

    node.dispatchEvent(new Event("wheel"));
    node.scrollTop = 120;
    setScrollGeometry(node, 1200);
    await act(async () => grow(8));
    expect(node.scrollTop).toBe(120);
  } finally {
    await act(async () => root.unmount());
  }
});
