const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createNavigation } = require("./navigation.cjs");

/** A distinct solid color per call keeps content-hash duplicate review from pairing unrelated fixtures. */
function colorFor(seed) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `#${(hash & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Renders a PNG in the page, then hands it to the transport the way a picked file arrives. */
async function pngBytes(run, seed) {
  return run(
    `(() => { const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64; const context = canvas.getContext('2d'); context.fillStyle = ${JSON.stringify(colorFor(seed))}; context.fillRect(0, 0, 96, 64); context.fillStyle = '#ffffff'; context.fillRect(8, 8, 24, 24); return canvas.toDataURL('image/png').split(',')[1]; })()`,
  );
}

/** Desktop imports a host path; the browser registers a device File and uploads it on import. */
async function deviceImage({ run, mode }, name, base64) {
  if (mode === "web")
    return run(
      `(() => { const binary = atob(${JSON.stringify(base64)}); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); return window.pond.pathForFile(new File([bytes], ${JSON.stringify(name)}, { type: 'image/png' })); })()`,
    );
  const path = join(mkdtempSync(join(tmpdir(), "circe-e2e-image-")), name);
  writeFileSync(path, Buffer.from(base64, "base64"));
  return path;
}

async function folderIdsOf(query, saveId) {
  const memberships = await query("folders.memberships");
  return memberships
    .filter((row) => row.saveId === saveId)
    .map((row) => row.folderId)
    .sort();
}

async function purge(query, ids) {
  const owned = ids.filter(Boolean);
  if (owned.length)
    await query("saves.bulkEdit", {
      ids: owned,
      operation: { kind: "purge" },
    });
}

/** Snapshots and restores the system clipboard around a scenario that has to write it. */
async function borrowClipboard() {
  const { ClipboardItem, clipboard } = require("electron");
  /** Electron refuses to re-write items read from the clipboard, so keep their data instead. */
  const saved = [];
  for (const item of await clipboard.read().catch(() => [])) {
    const data = {};
    for (const type of item.types) data[type] = await item.getType(type);
    saved.push(data);
  }
  return {
    async writePng(base64) {
      await clipboard.write([
        new ClipboardItem({
          "image/png": new Blob([Buffer.from(base64, "base64")], {
            type: "image/png",
          }),
        }),
      ]);
    },
    async restore() {
      if (saved.length)
        await clipboard.write(saved.map((data) => new ClipboardItem(data)));
      else clipboard.clear();
    },
  };
}

/** Pond 2.7.0.2 additions: imports filed into the folder on screen, pinned sections, thumbnails and Recently Added dates. */
exports.folderImportCases = [
  {
    id: "import.files-into-folder-keep-existing-folders",
    queries: [
      "folders.create",
      "folders.delete",
      "folders.memberships",
      "saves.bulkEdit",
      "saves.importFiles",
    ],
    async verify(controls) {
      const { query, run, nonce } = controls;
      const first = await query("folders.create", {
        name: `E2E Import A ${nonce}`,
      });
      const second = await query("folders.create", {
        name: `E2E Import B ${nonce}`,
      });
      const ids = [];
      try {
        const bytes = await pngBytes(run, `keep-${nonce}`);
        // Paste, drop and Add Files in a folder view all pass that folder.
        const imported = await query("saves.importFiles", {
          paths: [await deviceImage(controls, `circe-${nonce}.png`, bytes)],
          folderIds: [first.id],
        });
        assert.equal(imported.ok, true, JSON.stringify(imported));
        assert.equal(imported.ids.length, 1);
        const [id] = imported.ids;
        ids.push(id);
        assert.deepEqual(await folderIdsOf(query, id), [first.id]);

        // Re-importing the same bytes as "use existing" into another folder adds
        // that folder; since this sync it no longer drops the Save's earlier folder.
        const again = await deviceImage(
          controls,
          `circe-${nonce}-again.png`,
          bytes,
        );
        const reused = await query("saves.importFiles", {
          paths: [again],
          folderIds: [second.id],
          duplicateDecisions: { [again]: "use-existing" },
        });
        assert.equal(reused.ok, true, JSON.stringify(reused));
        for (const extra of reused.ids) if (extra !== id) ids.push(extra);
        assert.deepEqual(reused.ids, [id]);
        assert.deepEqual(
          await folderIdsOf(query, id),
          [first.id, second.id].sort(),
        );
        return {
          filedIntoViewedFolder: true,
          reusedExistingSave: true,
          keptEarlierFolder: true,
        };
      } finally {
        await purge(query, ids);
        await query("folders.delete", { id: first.id });
        await query("folders.delete", { id: second.id });
      }
    },
  },
  {
    id: "import.clipboard-into-viewed-folder",
    queries: [
      "folders.create",
      "folders.delete",
      "folders.memberships",
      "saves.bulkEdit",
      "saves.importClipboard",
    ],
    async verify(controls) {
      const { query, run, click, nonce } = controls;
      const folder = await query("folders.create", {
        name: `E2E Clipboard ${nonce}`,
      });
      const borrowed = await borrowClipboard();
      const ids = [];
      try {
        await borrowed.writePng(await pngBytes(run, `clipboard-${nonce}`));
        // The browser reads the visiting device's clipboard, which needs page focus.
        await click('[data-sidebar-sortable="all"] button');
        const result = await query("saves.importClipboard", {
          folderId: folder.id,
        });
        assert.equal(result.ok, true, JSON.stringify(result));
        ids.push(...result.ids);
        assert.equal(result.ids.length, 1);
        // Before this sync the browser ignored the folder and filed nothing.
        assert.deepEqual(await folderIdsOf(query, result.ids[0]), [folder.id]);
        return { clipboardImageImported: true, filedIntoViewedFolder: true };
      } finally {
        await borrowed.restore();
        await purge(query, ids);
        await query("folders.delete", { id: folder.id });
      }
    },
  },
  {
    id: "ui.pond-2-7-0-2-tour",
    queries: [
      "folders.create",
      "folders.delete",
      "folders.memberships",
      "saves.bulkEdit",
      "saves.importFiles",
      "settings.getPrefs",
      "settings.setPrefs",
    ],
    async verify(controls) {
      const { query, run, waitFor, click, snapshot, mode, nonce } = controls;
      const { navigate, clickText } = createNavigation(controls);
      const isWeb = mode === "web";
      const empty = await query("folders.create", {
        name: `E2E Empty ${nonce}`,
      });
      const pinnedFolder = await query("folders.create", {
        name: `E2E Pinned ${nonce}`,
      });
      const ids = [];
      const openFolder = async (id) => {
        await click(`[data-folder-sortable="${id}"]`);
        await waitFor(
          `Boolean(document.querySelector('[data-folder-sortable="${id}"] [aria-current="page"], [data-folder-sortable="${id}"][aria-current="page"], [data-folder-sortable="${id}"] [data-status="active"]')) && (${!isWeb} || location.search.includes(${JSON.stringify(`folder=${encodeURIComponent(id)}`)}))`,
        );
      };
      try {
        const images = [];
        for (const label of ["pinned", "contents"]) {
          const imported = await query("saves.importFiles", {
            paths: [
              await deviceImage(
                controls,
                `circe-${label}-${nonce}.png`,
                await pngBytes(run, `${label}-${nonce}`),
              ),
            ],
            folderIds: [pinnedFolder.id],
          });
          assert.equal(imported.ok, true, JSON.stringify(imported));
          ids.push(...imported.ids);
          images.push(imported.ids[0]);
        }
        const [pinnedId, contentsId] = images;
        await query("settings.setPrefs", {
          folderViews: {
            [pinnedFolder.id]: {
              pinnedIds: [pinnedId],
              pinnedCollapsed: false,
            },
          },
        });

        await navigate("/", "document.querySelector('[data-library-search]')");

        // An empty folder offers Add Files and names paste and drop.
        await openFolder(empty.id);
        await waitFor(
          "Boolean(document.querySelector('[data-folder-add-files]')) && document.body.innerText.includes('Paste or drop files, images, and links here.')",
        );
        await snapshot(`${mode}-empty-folder-add-files`);

        // A pasted image in a folder view is filed there, and its toast offers Show in Library.
        // Desktop reads the system clipboard (a page-made File has no host path);
        // the browser uploads the pasted File itself.
        const pasteBytes = await pngBytes(run, `paste-${nonce}`);
        const borrowed = await borrowClipboard();
        try {
          await borrowed.writePng(pasteBytes);
          await run("document.activeElement && document.activeElement.blur()");
          await run(
            `(() => { const binary = atob(${JSON.stringify(pasteBytes)}); const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0)); const data = new DataTransfer(); data.items.add(new File([bytes], 'Pasted image.png', { type: 'image/png' })); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true })); return true; })()`,
          );
          await waitFor(
            "Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === 'Show in Library')",
          );
        } finally {
          await borrowed.restore();
        }
        await snapshot(`${mode}-paste-toast-show-in-library`);
        const pasted = (await query("folders.memberships")).find(
          (row) => row.folderId === empty.id,
        );
        assert.ok(pasted, "the pasted image was not filed into the folder");
        ids.push(pasted.saveId);
        // Leave the folder, then follow the toast back to the imported Save.
        await click('[data-sidebar-sortable="all"] button');
        await clickText("button", "Show in Library");
        await waitFor(
          `(() => { const card = document.querySelector('[data-save-id="${pasted.saveId}"]'); return Boolean(card) && (card.matches('[data-cursor]') || Boolean(card.closest('[aria-selected="true"]'))) && (${!isWeb} || location.search.includes(${JSON.stringify(`folder=${encodeURIComponent(empty.id)}`)})); })()`,
        );
        await snapshot(`${mode}-show-in-library`);

        // Pinned Saves get their own collapsible section above Contents.
        await openFolder(pinnedFolder.id);
        await waitFor(
          `(() => { const toggle = document.querySelector('[data-pinned-toggle]'); return Boolean(toggle) && toggle.textContent.includes('Pinned (1)') && toggle.getAttribute('aria-expanded') === 'true' && document.body.innerText.includes('Contents (1)') && Boolean(document.querySelector('[data-save-id="${pinnedId}"]')) && Boolean(document.querySelector('[data-save-id="${contentsId}"]')); })()`,
        );
        await snapshot(`${mode}-pinned-section-open`);
        await click("[data-pinned-toggle]");
        await waitFor(
          `document.querySelector('[data-pinned-toggle]').getAttribute('aria-expanded') === 'false' && !document.querySelector('[data-save-id="${pinnedId}"]') && Boolean(document.querySelector('[data-save-id="${contentsId}"]'))`,
        );
        await waitFor(
          `window.pond.query('settings.getPrefs',{}).then(prefs => prefs.folderViews[${JSON.stringify(pinnedFolder.id)}]?.pinnedCollapsed === true)`,
        );
        const prefs = await query("settings.getPrefs");
        assert.equal(prefs.folderViews[pinnedFolder.id].pinnedCollapsed, true);
        await snapshot(`${mode}-pinned-section-collapsed`);

        // The detail menu opens the thumbnail at full size.
        await navigate(
          `/save/${encodeURIComponent(contentsId)}`,
          "document.querySelector('button[aria-label=\"Save Actions\"]')",
        );
        await click('button[aria-label="Save Actions"]');
        await clickText('[role="menuitem"]', "View Thumbnail");
        await waitFor(
          "(() => { const image = document.querySelector('[data-thumbnail-viewer] img'); return Boolean(image) && image.complete && image.naturalWidth > 0; })()",
        );
        const thumbnail = await run(
          "(() => { const image = document.querySelector('[data-thumbnail-viewer] img'); return { width: image.naturalWidth, height: image.naturalHeight, browserMedia: image.src.includes('/web/media/') }; })()",
        );
        assert.equal(thumbnail.width, 96);
        assert.equal(thumbnail.height, 64);
        assert.equal(thumbnail.browserMedia, isWeb);
        await snapshot(`${mode}-thumbnail-viewer`);
        await controls.press("Escape");
        await waitFor("!document.querySelector('[data-thumbnail-viewer]')");

        // Recently Added's menu jumps to one day; the browser URL keeps that filter.
        await navigate("/", "document.querySelector('[data-library-search]')");
        await click(
          '[data-sidebar-sortable="recentlyAdded"] button',
          1,
          "right",
        );
        await clickText('[role="menuitem"]', "Added Today");
        const dayFilter = `(${!isWeb} || location.pathname === '/recently-added') && document.body.innerText.includes('Saved Today') && Boolean(document.querySelector('[data-save-id="${contentsId}"]'))`;
        await waitFor(dayFilter);
        await new Promise((resolve) => setTimeout(resolve, 750));
        assert.equal(await run(dayFilter), true, "the day filter was reset");
        await snapshot(`${mode}-recently-added-today`);
        // A plain click on Recently Added clears the day filter so later scenarios start unfiltered.
        await click('[data-sidebar-sortable="recentlyAdded"] button');
        await waitFor("!document.body.innerText.includes('Saved Today')");
        await navigate("/", "document.querySelector('[data-library-search]')");
        return {
          emptyFolderAddFiles: true,
          pasteFiledIntoFolder: true,
          showInLibrary: true,
          pinnedSectionCollapses: true,
          thumbnailFullSize: true,
          recentlyAddedDayFilter: true,
        };
      } finally {
        await purge(query, ids);
        await query("folders.delete", { id: empty.id });
        await query("folders.delete", { id: pinnedFolder.id });
      }
    },
  },
];
