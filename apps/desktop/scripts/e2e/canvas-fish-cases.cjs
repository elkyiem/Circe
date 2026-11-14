const assert = require("node:assert/strict");
const { createNavigation } = require("./navigation.cjs");

exports.canvasFishCases = [
  {
    id: "canvases.persist-and-conflict",
    queries: [
      "canvases.create",
      "canvases.get",
      "canvases.list",
      "canvases.rename",
      "canvases.update",
      "canvases.delete",
    ],
    async verify({ query, nonce }) {
      const canvas = await query("canvases.create", {
        name: `Canvas ${nonce}`,
      });
      const content = {
        viewport: { x: 20, y: -10, zoom: 1.5 },
        items: [
          {
            id: "note",
            kind: "note",
            x: 10,
            y: 20,
            width: 200,
            height: 100,
            text: "日本語 café",
            color: "blue",
          },
          {
            id: "text",
            kind: "text",
            x: 250,
            y: 20,
            width: 200,
            height: 100,
            text: "Linked text",
          },
        ],
        connectors: [
          {
            id: "edge",
            from: "note",
            to: "text",
            fromSide: "right",
            toSide: "left",
            line: "curved",
            startArrow: false,
            endArrow: true,
            dashed: false,
            color: "gray",
            label: "Connection",
          },
        ],
      };
      await query("canvases.rename", {
        id: canvas.id,
        name: `Renamed ${nonce}`,
      });
      await query("canvases.update", {
        id: canvas.id,
        content,
        expectedContent: canvas.contentVersion,
      });
      const stored = await query("canvases.get", { id: canvas.id });
      assert.equal(stored.name, `Renamed ${nonce}`);
      assert.deepEqual(stored.items, content.items);
      assert.deepEqual(stored.connectors, content.connectors);
      assert.deepEqual(stored.viewport, content.viewport);
      await assert.rejects(
        query("canvases.update", {
          id: canvas.id,
          content: { ...content, items: [], connectors: [] },
          expectedContent: canvas.contentVersion,
        }),
      );
      assert.deepEqual(
        (await query("canvases.get", { id: canvas.id })).items,
        content.items,
      );
      assert.equal(
        (await query("canvases.list")).find((row) => row.id === canvas.id)
          .itemCount,
        2,
      );
      await query("canvases.delete", { id: canvas.id });
      assert.equal(await query("canvases.get", { id: canvas.id }), null);
      return {
        content,
        renamePreserved: true,
        staleWriteRejected: true,
        deleted: true,
      };
    },
  },
  {
    id: "fish.chat-lifecycle",
    queries: [
      "fish.create",
      "fish.update",
      "fish.list",
      "fish.markSeen",
      "fish.delete",
      "agent.newChat",
      "agent.renameChat",
      "agent.chats",
      "agent.messages",
      "agent.deleteChat",
    ],
    async verify({ query, nonce }) {
      const fish = await query("fish.create", {
        name: "Parity Fish",
        color: "blue",
        instructions: "Offline parity test",
        scope: { folderIds: [], tags: ["café"] },
      });
      await query("fish.update", {
        id: fish.id,
        patch: { name: "Renamed Fish", species: "manta" },
      });
      const stored = (await query("fish.list")).find(
        (row) => row.id === fish.id,
      );
      assert.equal(stored.name, "Renamed Fish");
      assert.equal(stored.species, "manta");
      assert.deepEqual(stored.scope, { folderIds: [], tags: ["café"] });
      assert.equal((await query("fish.markSeen", { id: fish.id })).ok, true);
      const chat = await query("agent.newChat", { fishId: fish.id });
      assert.ok(chat.id);
      assert.deepEqual(await query("agent.messages", { chatId: chat.id }), []);
      const title = `Conversation ${nonce}`;
      await query("agent.renameChat", { chatId: chat.id, title });
      assert.equal(
        (await query("agent.chats", { fishId: fish.id })).find(
          (row) => row.id === chat.id,
        ).title,
        title,
      );
      assert.ok(
        !(await query("agent.chats", { fishId: "default" })).some(
          (row) => row.id === chat.id,
        ),
      );
      await query("agent.deleteChat", { chatId: chat.id });
      assert.ok(
        !(await query("agent.chats", { fishId: fish.id })).some(
          (row) => row.id === chat.id,
        ),
      );
      assert.equal((await query("fish.delete", { id: "default" })).ok, false);
      assert.equal((await query("fish.delete", { id: fish.id })).ok, true);
      assert.ok(!(await query("fish.list")).some((row) => row.id === fish.id));
      return {
        name: stored.name,
        species: stored.species,
        scope: stored.scope,
        isolatedChats: true,
        defaultProtected: true,
        deleted: true,
      };
    },
  },
  {
    id: "settings.persist-and-reload",
    queries: [
      "settings.getPrefs",
      "settings.setPrefs",
      "settings.get",
      "settings.setImageDownload",
    ],
    async verify({ query, run, waitFor }) {
      const prefs = await query("settings.getPrefs");
      const settings = await query("settings.get");
      try {
        await query("settings.setPrefs", {
          storage: { autoArchive: !prefs.storage.autoArchive },
        });
        await query("settings.setImageDownload", {
          splitPosts: !settings.imageDownload.splitPosts,
        });
        await run("location.reload()");
        await waitFor(
          "Boolean(window.pond && document.querySelector('[data-slot=window]'))",
        );
        assert.equal(
          (await query("settings.getPrefs")).storage.autoArchive,
          !prefs.storage.autoArchive,
        );
        assert.equal(
          (await query("settings.get")).imageDownload.splitPosts,
          !settings.imageDownload.splitPosts,
        );
        return { archivePersisted: true, imagePreferencePersisted: true };
      } finally {
        await query("settings.setPrefs", { storage: prefs.storage });
        await query("settings.setImageDownload", settings.imageDownload);
      }
    },
  },
  {
    // Pond 2.6 Canvas minimap: the toggle shows a live overview of the board.
    id: "canvases.minimap-toggle",
    queries: ["canvases.create", "canvases.update", "canvases.delete"],
    async verify(controls) {
      const { query, run, waitFor, click, nonce } = controls;
      const { navigate } = createNavigation(controls);
      const canvas = await query("canvases.create", { name: `Map ${nonce}` });
      await query("canvases.update", {
        id: canvas.id,
        content: {
          viewport: { x: 0, y: 0, zoom: 1 },
          items: [0, 1].map((index) => ({
            id: `note-${index}`,
            kind: "note",
            x: index * 600,
            y: index * 300,
            width: 200,
            height: 120,
            text: `Minimap ${index}`,
            color: "yellow",
          })),
          connectors: [],
        },
        expectedContent: canvas.contentVersion,
      });
      const shown =
        "document.querySelector('[aria-label=Minimap]')?.parentElement.hasAttribute('data-shown')";
      try {
        await navigate(
          `/canvas/${canvas.id}`,
          'document.querySelector(\'[aria-label="Show Minimap"], [aria-label="Hide Minimap"]\')',
        );
        if (await run(`Boolean(${shown})`))
          await click('[aria-label="Hide Minimap"]');
        await waitFor(`!${shown}`);
        await click('[aria-label="Show Minimap"]');
        await waitFor(`Boolean(${shown})`);
        await waitFor(
          "document.querySelectorAll('[aria-label=Minimap] rect[data-kind=item]').length === 2",
        );
        await controls.snapshot(`${controls.mode}-canvas-minimap`);
        await click('[aria-label="Hide Minimap"]');
        await waitFor(`!${shown}`);
        return { minimapShown: true, minimapHidden: true };
      } finally {
        await navigate("/", "document.querySelector('[data-library-search]')");
        await query("canvases.delete", { id: canvas.id });
      }
    },
  },
];
