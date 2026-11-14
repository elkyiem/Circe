const assert = require("node:assert/strict");
const { createServer } = require("node:http");

exports.sourceCases = [
  {
    id: "sources.watch-sync-and-deduplication",
    queries: [
      "watches.resolve",
      "watches.add",
      "watches.list",
      "watches.setLabel",
      "watches.remove",
      "sources.setSchedule",
      "sources.setIncoming",
      "sources.overview",
      "sync.history",
      "saves.list",
      "saves.bulkEdit",
      "settings.getPrefs",
      "settings.setPrefs",
    ],
    async verify({ query, run, waitFor, nonce }) {
      let origin;
      let count = 1;
      const server = createServer((request, response) => {
        if (request.url === "/feed.xml") {
          response.setHeader("content-type", "application/rss+xml");
          const entries = Array.from(
            { length: count },
            (_, index) =>
              `<item><title>Offline article ${nonce} ${index}</title><link>${origin}/article/${index}</link><guid>${origin}/article/${index}</guid><pubDate>${new Date(Date.UTC(2026, 9, index + 1)).toUTCString()}</pubDate></item>`,
          )
            .reverse()
            .join("");
          response.end(
            `<?xml version="1.0"?><rss version="2.0"><channel><title>Parity feed</title><link>${origin}</link><description>Offline fixture</description>${entries}</channel></rss>`,
          );
        } else {
          const index = request.url.split("/").at(-1);
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(
            `<!doctype html><title>Offline article ${nonce} ${index}</title><meta property="og:type" content="article"><meta property="og:title" content="Offline article ${nonce} ${index}"><article><h1>Offline article ${nonce} ${index}</h1><p>Local RSS capture exercises the real Watch, Sync, harvest and Library persistence pipeline without a Source account or external network.</p></article>`,
          );
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      origin = `http://127.0.0.1:${server.address().port}`;
      const handle = `${origin}/feed.xml`;
      const prefs = await query("settings.getPrefs");
      let watch;
      const rows = async () =>
        (await query("saves.list", { limit: 10000 })).filter(
          (save) => save.accountId === watch.id,
        );
      const settled = () =>
        waitFor(
          `window.pond.query('watches.list',{}).then(value=>value.watches.some(watch=>watch.id===${JSON.stringify(watch.id)} && !watch.syncing && watch.sync.lastSyncedAt))`,
          60000,
        );
      try {
        await query("settings.setPrefs", { storage: { autoArchive: false } });
        assert.equal(
          (await query("watches.resolve", { source: "web", input: handle })).ok,
          true,
        );
        const added = await query("watches.add", { source: "web", handle });
        assert.equal(added.ok, true);
        watch = added.watch;
        await settled();
        await waitFor(
          `window.pond.query('saves.list',{limit:10000}).then(rows=>rows.filter(row=>row.accountId===${JSON.stringify(watch.id)} && row.status==='complete').length===1)`,
          60000,
        );
        assert.equal((await rows())[0].url, `${origin}/article/0`);
        await query("watches.setLabel", {
          watchId: watch.id,
          label: "Renamed parity feed",
        });
        await query("sources.setSchedule", {
          kind: "watch",
          id: watch.id,
          paused: true,
          intervalHours: 12,
        });
        await query("sources.setIncoming", {
          kind: "watch",
          id: watch.id,
          tags: ["Parity incoming"],
        });
        const scheduled = (await query("watches.list")).watches.find(
          (row) => row.id === watch.id,
        );
        assert.equal(scheduled.label, "Renamed parity feed");
        assert.equal(scheduled.sync.paused, true);
        assert.equal(scheduled.sync.intervalHours, 12);
        assert.deepEqual(scheduled.sync.incoming.tags, ["Parity incoming"]);
        await query("sources.setSchedule", {
          kind: "watch",
          id: watch.id,
          paused: false,
          intervalHours: 12,
        });
        count = 2;
        assert.equal(
          (await run(`window.pond.syncRunNow(${JSON.stringify(watch.id)})`)).ok,
          true,
        );
        await waitFor(
          `window.pond.query('saves.list',{limit:10000}).then(rows=>rows.filter(row=>row.accountId===${JSON.stringify(watch.id)} && row.status==='complete').length===2)`,
          60000,
        );
        await settled();
        const captured = await rows();
        const incoming = captured.find(
          (row) => row.url === `${origin}/article/1`,
        );
        assert.ok(incoming.tags.includes("Parity incoming"));
        const before = (await query("watches.list")).watches.find(
          (row) => row.id === watch.id,
        ).sync.lastSyncedAt;
        assert.equal(
          (await run(`window.pond.syncRunNow(${JSON.stringify(watch.id)})`)).ok,
          true,
        );
        await waitFor(
          `window.pond.query('watches.list',{}).then(value=>value.watches.some(watch=>watch.id===${JSON.stringify(watch.id)} && !watch.syncing && watch.sync.lastSyncedAt!==${JSON.stringify(before)}))`,
          60000,
        );
        assert.equal((await rows()).length, 2);
        assert.equal(
          (await query("watches.add", { source: "web", handle })).reason,
          "already_watching",
        );
        assert.equal(
          (await query("sources.overview", { id: watch.id })).saves,
          2,
        );
        const history = await query("sync.history", {
          source: "web",
          accountId: watch.id,
        });
        assert.ok(history.runs.length >= 3);
        assert.ok(
          history.runs.every(
            (row) => row.outcome === "ok" || row.outcome === "noop",
          ),
        );
        return {
          captured: 2,
          repeatDeduplicates: true,
          incomingTagApplied: true,
          schedule: {
            paused: scheduled.sync.paused,
            intervalHours: scheduled.sync.intervalHours,
          },
          historyRecorded: true,
        };
      } finally {
        if (watch) {
          await query("watches.remove", { watchId: watch.id });
          assert.ok(
            !(await query("watches.list")).watches.some(
              (row) => row.id === watch.id,
            ),
          );
          const owned = await rows();
          if (owned.length)
            await query("saves.bulkEdit", {
              ids: owned.map((row) => row.id),
              operation: { kind: "purge" },
            });
          await query("tags.delete", { name: "Parity incoming" });
        }
        await query("settings.setPrefs", { storage: prefs.storage });
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  },
  {
    id: "downloads.pause-and-resume",
    queries: [
      "pipeline.status",
      "queue.source.pause",
      "queue.source.resume",
      "queue.sourceGates",
    ],
    async verify({ query, run }) {
      assert.equal((await run("window.pond.pipelinePause(true)")).ok, true);
      try {
        assert.equal((await query("pipeline.status")).paused, true);
      } finally {
        await run("window.pond.pipelinePause(false)");
      }
      assert.equal((await query("pipeline.status")).paused, false);
      await query("queue.source.pause", { source: "web" });
      try {
        const gate = (await query("queue.sourceGates")).find(
          (row) => row.source === "web",
        );
        assert.equal(gate.state, "paused");
        // Pond 2.6 explains download limits from the gate's hourly and daily budget.
        assert.ok(Number.isFinite(gate.maxPerHour) && gate.maxPerHour > 0);
        assert.ok(Number.isFinite(gate.maxPerDay) && gate.maxPerDay > 0);
      } finally {
        await query("queue.source.resume", { source: "web" });
      }
      assert.notEqual(
        (await query("queue.sourceGates")).find((row) => row.source === "web")
          ?.state,
        "paused",
      );
      return {
        pipelinePaused: true,
        pipelineResumed: true,
        sourcePaused: true,
        sourceResumed: true,
        gateLimitsReported: true,
      };
    },
  },
  {
    // Pond 2.5–2.7: Fetch All, Fetch on Launch, source folders and purged items.
    id: "sources.fetch-all-folder-and-purged-skip",
    queries: [
      "folders.create",
      "folders.memberships",
      "folders.delete",
      "watches.add",
      "watches.list",
      "watches.remove",
      "sources.setIncoming",
      "saves.list",
      "saves.bulkEdit",
      "settings.getPrefs",
      "settings.setPrefs",
    ],
    async verify({ query, run, waitFor, nonce }) {
      let origin;
      let count = 1;
      const server = createServer((request, response) => {
        if (request.url === "/feed.xml") {
          response.setHeader("content-type", "application/rss+xml");
          const entries = Array.from(
            { length: count },
            (_, index) =>
              `<item><title>Fetch all ${nonce} ${index}</title><link>${origin}/post/${index}</link><guid>${origin}/post/${index}</guid><pubDate>${new Date(Date.UTC(2026, 10, index + 1)).toUTCString()}</pubDate></item>`,
          )
            .reverse()
            .join("");
          response.end(
            `<?xml version="1.0"?><rss version="2.0"><channel><title>Fetch all feed</title><link>${origin}</link><description>Offline fixture</description>${entries}</channel></rss>`,
          );
        } else {
          const index = request.url.split("/").at(-1);
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end(
            `<!doctype html><title>Fetch all ${nonce} ${index}</title><meta property="og:type" content="article"><article><h1>Fetch all ${nonce} ${index}</h1><p>Offline Source fixture for Fetch All and purged-item checks.</p></article>`,
          );
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      origin = `http://127.0.0.1:${server.address().port}`;
      const prefs = await query("settings.getPrefs");
      const folder = await query("folders.create", {
        name: `Source folder ${nonce}`,
      });
      let watch;
      const owned = async () =>
        (await query("saves.list", { limit: 10000 })).filter(
          (save) => save.accountId === watch.id,
        );
      const settled = (before) =>
        waitFor(
          `window.pond.query('watches.list',{}).then(value=>value.watches.some(watch=>watch.id===${JSON.stringify(watch?.id)} && !watch.syncing && watch.sync.lastSyncedAt && watch.sync.lastSyncedAt!==${JSON.stringify(before ?? null)}))`,
          60000,
        );
      const lastSynced = async () =>
        (await query("watches.list")).watches.find((row) => row.id === watch.id)
          .sync.lastSyncedAt;
      const completeCount = (expected) =>
        waitFor(
          `window.pond.query('saves.list',{limit:10000}).then(rows=>rows.filter(row=>row.accountId===${JSON.stringify(watch.id)} && row.status==='complete').length===${expected})`,
          60000,
        );
      try {
        await query("settings.setPrefs", {
          storage: { autoArchive: false },
          sync: { launch: true },
        });
        assert.equal((await query("settings.getPrefs")).sync.launch, true);
        const added = await query("watches.add", {
          source: "web",
          handle: `${origin}/feed.xml`,
        });
        assert.equal(added.ok, true);
        watch = added.watch;
        await settled();
        await completeCount(1);
        await query("sources.setIncoming", {
          kind: "watch",
          id: watch.id,
          folderId: folder.id,
          tags: [],
        });
        count = 2;
        const before = await lastSynced();
        const fetchAll = await run("window.pond.syncRunAll()");
        assert.ok(
          fetchAll.ok === true || fetchAll.reason === "already_running",
          JSON.stringify(fetchAll),
        );
        await settled(before);
        await completeCount(2);
        const fetched = await owned();
        const second = fetched.find((row) => row.url === `${origin}/post/1`);
        assert.ok(second, "Fetch All imported the new post");
        await waitFor(
          `window.pond.query('folders.memberships',{}).then(rows=>rows.some(row=>row.saveId===${JSON.stringify(second.id)} && row.folderId===${JSON.stringify(folder.id)}))`,
          30000,
        );
        assert.ok(
          (await query("folders.memberships")).some(
            (row) => row.saveId === second.id && row.folderId === folder.id,
          ),
        );
        const first = fetched.find((row) => row.url === `${origin}/post/0`);
        await query("saves.bulkEdit", {
          ids: [first.id],
          operation: { kind: "purge" },
        });
        const beforeRefetch = await lastSynced();
        assert.equal(
          (await run(`window.pond.syncRunNow(${JSON.stringify(watch.id)})`)).ok,
          true,
        );
        await settled(beforeRefetch);
        const after = await owned();
        assert.deepEqual(
          after.map((row) => row.url),
          [`${origin}/post/1`],
          "a purged post stays deleted after the next fetch",
        );
        return {
          launchPreferencePersisted: true,
          fetchAllImported: 1,
          filedIntoSourceFolder: true,
          purgedNotRefetched: true,
        };
      } finally {
        if (watch) {
          await query("watches.remove", { watchId: watch.id });
          const rows = await owned();
          if (rows.length)
            await query("saves.bulkEdit", {
              ids: rows.map((row) => row.id),
              operation: { kind: "purge" },
            });
        }
        await query("folders.delete", { id: folder.id });
        await query("settings.setPrefs", {
          storage: prefs.storage,
          sync: { launch: prefs.sync.launch },
        });
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  },
];
