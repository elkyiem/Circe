const assert = require("node:assert/strict");
const { createNavigation } = require("./navigation.cjs");

/** Pond 2.8 additions: the Inbox, scoped Undo steps, favorites, Library Health and folder previews. */
exports.inboxHealthCases = [
  {
    id: "inbox.capture-review-and-scoped-undo",
    queries: [
      "folders.create",
      "folders.delete",
      "folders.memberships",
      "folders.previews",
      "saves.bulkEdit",
      "saves.get",
      "saves.quickAdd",
    ],
    async verify({ query, run, nonce }) {
      const folder = await query("folders.create", {
        name: `E2E Inbox ${nonce}`,
      });
      let id = null;
      try {
        // A one-off capture lands in the Inbox and, since 2.8, in the chosen folder.
        const added = await query("saves.quickAdd", {
          note: `E2E inbox capture ${nonce}`,
          folderId: folder.id,
        });
        assert.equal(added.ok, true, JSON.stringify(added));
        id = added.id;
        const get = () => query("saves.get", { id });
        assert.equal((await get()).inboxState, "review");
        const memberships = await query("folders.memberships");
        assert.ok(
          memberships.some(
            (row) => row.saveId === id && row.folderId === folder.id,
          ),
          JSON.stringify(memberships),
        );
        const previews = await query("folders.previews", {
          folderIds: [folder.id],
          limit: 4,
        });
        assert.deepEqual(Object.keys(previews), [folder.id]);
        assert.ok(Array.isArray(previews[folder.id]));

        // Each recorded change returns its own Undo step.
        const processed = await query("saves.bulkEdit", {
          ids: [id],
          operation: { kind: "inbox", state: "processed" },
        });
        assert.equal(processed.changed, 1);
        assert.match(processed.undoId, /\S/);
        assert.equal((await get()).inboxState, "processed");

        const step = (kind, undoId) =>
          run(`window.pond.${kind}(${JSON.stringify(undoId)})`);
        const undone = await step("undoStep", processed.undoId);
        assert.equal(undone.outcome, "done");
        assert.equal((await get()).inboxState, "review");
        // Undoing an already-undone step is idempotent.
        assert.equal(
          (await step("undoStep", processed.undoId)).outcome,
          "done",
        );
        assert.equal(
          (await step("redoStep", processed.undoId)).outcome,
          "done",
        );
        assert.equal((await get()).inboxState, "processed");

        const favorite = await query("saves.bulkEdit", {
          ids: [id],
          operation: { kind: "favorite", favorite: true },
        });
        assert.equal(favorite.changed, 1);
        assert.equal((await get()).favorite, true);
        // A newer change sits above the Inbox step, so its toast cannot reverse it.
        assert.equal(
          (await step("undoStep", processed.undoId)).outcome,
          "stale",
        );
        assert.equal((await get()).inboxState, "processed");
        // Global Undo reports which step it reversed.
        const latest = await run("window.pond.undo()");
        assert.equal(latest.ok, true);
        assert.equal(latest.step, favorite.undoId);
        assert.equal((await get()).favorite, false);
        return {
          capturedToInbox: true,
          filedIntoFolder: true,
          folderPreviewsKeyed: true,
          scopedUndoRedo: true,
          staleStepRefused: true,
          globalUndoReportsStep: true,
        };
      } finally {
        if (id)
          await query("saves.bulkEdit", {
            ids: [id],
            operation: { kind: "purge" },
          });
        await query("folders.delete", { id: folder.id });
      }
    },
  },
  {
    id: "health.check-recheck-and-posters",
    queries: [
      "libraryHealth.cancel",
      "libraryHealth.check",
      "libraryHealth.overview",
      "libraryHealth.recheck",
      "libraryHealth.retryPosters",
      "saves.bulkEdit",
      "saves.quickAdd",
    ],
    async verify({ query, waitFor, nonce }) {
      // The disposable Library may be empty here, so the check gets its own Save.
      const added = await query("saves.quickAdd", {
        note: `E2E health ${nonce}`,
      });
      assert.equal(added.ok, true, JSON.stringify(added));
      try {
        const before = await query("libraryHealth.overview");
        assert.ok(Number.isInteger(before.media.pendingPosters));
        const job = await query("libraryHealth.check");
        assert.ok(["running", "completed"].includes(job.status), job.status);
        await waitFor(
          `window.pond.query('libraryHealth.overview',{}).then(value => value.job && value.job.id === ${JSON.stringify(job.id)} && value.job.status !== 'running' && value.check)`,
          120000,
        );
        const overview = await query("libraryHealth.overview");
        assert.equal(overview.job.status, "completed");
        assert.ok(overview.check.saves >= 1, JSON.stringify(overview.check));
        assert.equal(overview.check.indexError, null);
        const recheck = await query("libraryHealth.recheck", {
          saveIds: [added.id],
        });
        assert.ok(recheck === null || Number.isFinite(recheck.checkedAt));
        const posters = await query("libraryHealth.retryPosters", {
          saveIds: [added.id],
        });
        assert.ok(Number.isInteger(posters.queued));
        // Nothing is running, so cancel reports the finished job or nothing.
        const cancelled = await query("libraryHealth.cancel");
        assert.ok(cancelled === null || cancelled.status !== "running");
        return {
          checked: true,
          countsReported: true,
          recheckAnswers: true,
          postersQueued: true,
          cancelSettles: true,
        };
      } finally {
        await query("saves.bulkEdit", {
          ids: [added.id],
          operation: { kind: "purge" },
        });
      }
    },
  },
  {
    id: "settings.app-icon-appearance",
    queries: ["settings.appIconAppearance"],
    async verify({ query }) {
      const appearance = await query("settings.appIconAppearance");
      // The browser reports the host's Dock icon style, not the visiting device's.
      assert.deepEqual(Object.keys(appearance).sort(), ["macosMajor", "style"]);
      return { reportsHostAppearance: true };
    },
  },
  {
    id: "ui.pond-2-8-tour",
    queries: ["saves.quickAdd", "saves.bulkEdit"],
    async verify(controls) {
      const { query, run, waitFor, snapshot, mode, nonce } = controls;
      const { navigate, clickText } = createNavigation(controls);
      const added = await query("saves.quickAdd", {
        note: `E2E tour capture ${nonce}`,
      });
      assert.equal(added.ok, true);
      try {
        await navigate("/", "document.querySelector('[data-library-search]')");
        // The Inbox button in the sidebar header opens the full-page review deck.
        await waitFor(
          "Array.from(document.querySelectorAll('button[aria-label^=\"Inbox\"]')).length > 0",
        );
        await run(
          "document.querySelector('button[aria-label^=\"Inbox\"]').setAttribute('data-e2e-target','inbox')",
        );
        await controls.click('[data-e2e-target="inbox"]');
        // The browser keeps the Inbox in its URL, so its own history cannot reset it to All.
        await waitFor(
          "document.body.innerText.includes('Needs Review') && Boolean(document.querySelector('[aria-label=\\\"Review Inbox\\\"]')) && (document.documentElement.dataset.runtime !== 'browser' || location.search.includes('scope=inbox'))",
        );
        await snapshot(`${mode}-inbox-review`);
        await controls.press("Escape");

        await navigate(
          "/settings/health",
          "Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === 'Check Library')",
        );
        await clickText("button", "Check Library");
        await waitFor(
          "window.pond.query('libraryHealth.overview',{}).then(value => value.check && value.job && value.job.status === 'completed')",
          120000,
        );
        await snapshot(`${mode}-library-health`);

        await navigate(
          "/settings/library",
          "document.body.innerText.includes('Inbox') && document.body.innerText.includes('Devices')",
        );
        await snapshot(`${mode}-settings-library-inbox-devices`);

        await navigate("/split-posts", "document.body.innerText.length > 0");
        await snapshot(`${mode}-split-posts`);
        await navigate("/", "document.querySelector('[data-library-search]')");
        return {
          inboxDeckOpened: true,
          healthPageChecked: true,
          libraryInboxSettings: true,
          splitPostsPage: true,
        };
      } finally {
        await query("saves.bulkEdit", {
          ids: [added.id],
          operation: { kind: "purge" },
        });
      }
    },
  },
];
