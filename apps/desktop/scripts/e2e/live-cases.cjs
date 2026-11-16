const assert = require("node:assert/strict");
const {
  createReadStream,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} = require("node:fs");
const { createServer } = require("node:http");
const { join } = require("node:path");

/**
 * Live scenarios use the real yt-dlp and ffmpeg binaries and real provider
 * endpoints. They run with `pnpm e2e:live`, never in the offline suite.
 */
exports.liveCases = [
  {
    id: "live.downloader-probe-download-export",
    queries: [
      "downloader.probe",
      "downloader.frames",
      "downloader.start",
      "downloader.pickExportFolder",
      "downloader.exportFolder",
      "downloader.export",
      "downloader.reveal",
      "saves.list",
      "saves.bulkEdit",
    ],
    async verify({ query, waitFor, native, mode, nonce }) {
      const video = join(__dirname, "../../test/fixtures/web/video.mp4");
      const size = statSync(video).size;
      const server = createServer((request, response) => {
        if (!request.url.startsWith("/clip-")) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader("content-type", "video/mp4");
        response.setHeader("accept-ranges", "bytes");
        const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? "");
        if (range) {
          const start = Number(range[1]);
          const end = range[2] ? Number(range[2]) : size - 1;
          response.statusCode = 206;
          response.setHeader("content-range", `bytes ${start}-${end}/${size}`);
          response.setHeader("content-length", end - start + 1);
          createReadStream(video, { start, end }).pipe(response);
        } else {
          response.setHeader("content-length", size);
          createReadStream(video).pipe(response);
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const url = `http://127.0.0.1:${server.address().port}/clip-${nonce}.mp4`;
      const site = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
      const owned = async () =>
        (await query("saves.list", { limit: 10000 })).filter(
          (save) => save.url === url || save.sourceId === "jNQXAC9IVRw",
        );
      try {
        const probed = await query("downloader.probe", { url });
        assert.equal(probed.ok, true, JSON.stringify(probed));
        assert.equal(probed.probe.kind, "single");
        // yt-dlp's generic extractor reports no duration for a bare media file.
        assert.equal(probed.probe.source, "web");
        assert.equal(probed.probe.url, url);

        // A real site reports duration and chapters; frames need that duration.
        const remote = await query("downloader.probe", { url: site });
        assert.equal(remote.ok, true, JSON.stringify(remote));
        assert.equal(remote.probe.source, "youtube");
        assert.ok(remote.probe.duration >= 15, JSON.stringify(remote.probe));
        assert.ok(remote.probe.videoOptions.length > 0);
        const { frames } = await query("downloader.frames", {
          url: site,
          count: 3,
        });
        assert.ok(frames.length >= 2, `sampled ${frames.length} frames`);
        assert.ok(frames.every((frame) => frame.startsWith("data:image/")));

        // Direct media links probe fine but cannot be added to the Library yet:
        // upstream's web harvest rejects non-HTML responses (reported, not fixed here).
        const started = await query("downloader.start", {
          urls: [site],
          request: { mode: "video", maxHeight: 240 },
        });
        assert.equal(started.ids.length, 1, JSON.stringify(started));
        assert.deepEqual(started.failed, []);
        await waitFor(
          `window.pond.query('saves.list',{limit:10000}).then(rows=>rows.some(row=>row.sourceId==='jNQXAC9IVRw' && row.status==='complete' && row.files.some(file=>file.kind==='video')))`,
          180000,
        );

        const picked = await query("downloader.pickExportFolder");
        const folder = await query("downloader.exportFolder");
        if (mode === "web") {
          assert.deepEqual(picked, folder);
          assert.equal(folder.path, "");
        } else {
          assert.equal(picked.path, native.exportFolder);
          assert.equal(folder.path, native.exportFolder);
        }

        const before = native.downloads.length;
        const exported = await query("downloader.export", {
          url: site,
          request: { mode: "audio", audioFormat: "m4a" },
          destination: "file",
        });
        assert.equal(exported.ok, true, JSON.stringify(exported));
        let exportedFile;
        if (mode === "web") {
          // The browser receives the host's export as an ordinary download.
          assert.equal(exported.path, null);
          const deadline = Date.now() + 60000;
          while (native.downloads.length === before && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 200));
          exportedFile = native.downloads.at(-1);
          const deadlineDone = Date.now() + 60000;
          while (
            !native.completed.has(exportedFile) &&
            Date.now() < deadlineDone
          )
            await new Promise((resolve) => setTimeout(resolve, 200));
          assert.ok(
            native.completed.has(exportedFile),
            "browser download finished",
          );
        } else {
          exportedFile = exported.path;
          assert.ok(
            realpathSync(exportedFile).startsWith(
              realpathSync(native.exportFolder),
            ),
            exportedFile,
          );
        }
        assert.ok(existsSync(exportedFile), exportedFile);
        assert.match(exportedFile, /\.m4a$/);
        const header = readFileSync(exportedFile).subarray(4, 8).toString();
        assert.equal(header, "ftyp", "export is an MP4 audio container");

        const revealed = await query("downloader.reveal", {
          path: mode === "web" ? exportedFile : exported.path,
        });
        if (mode === "web") assert.deepEqual(revealed, { ok: false });
        else {
          assert.deepEqual(revealed, { ok: true });
          assert.equal(native.revealed.at(-1), exported.path);
          assert.deepEqual(
            await query("downloader.reveal", { path: "/etc/hosts" }),
            { ok: false },
          );
        }
        return {
          probed: true,
          framesSampled: true,
          downloadedToLibrary: true,
          exportedAudio: true,
          revealMatchesSurface: true,
        };
      } finally {
        const rows = await owned();
        if (rows.length)
          await query("saves.bulkEdit", {
            ids: rows.map((row) => row.id),
            operation: { kind: "purge" },
          });
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  },
  {
    id: "live.downloader-export-page-files",
    queries: ["downloader.exportFiles", "saves.list", "saves.bulkEdit"],
    async verify({ query, native, mode, nonce }) {
      // Two distinct PNGs a page linked to, served from loopback.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
        "base64",
      );
      const server = createServer((request, response) => {
        if (!/^\/(one|two)-/.test(request.url)) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader("content-type", "image/png");
        response.setHeader("content-length", png.length);
        response.end(png);
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const page = `${base}/page-${nonce}`;
      const files = [`${base}/one-${nonce}.png`, `${base}/two-${nonce}.png`];
      try {
        const saved = await query("downloader.exportFiles", {
          url: page,
          title: `E2E page files ${nonce}`,
          files,
          destination: "library",
        });
        assert.deepEqual(saved, { ok: true, paths: [] });
        const save = (await query("saves.list", { limit: 10000 })).find(
          (row) => row.url === page,
        );
        assert.ok(save, "the page's files became one Save");
        assert.equal(
          save.files.filter((file) => file.kind === "image").length,
          2,
        );

        const before = native.downloads.length;
        const exported = await query("downloader.exportFiles", {
          url: page,
          title: null,
          files,
          destination: "file",
        });
        assert.equal(exported.ok, true, JSON.stringify(exported));
        if (mode === "web") {
          // Browsers receive several files as one zip download.
          assert.deepEqual(exported.paths, []);
          const deadline = Date.now() + 60000;
          while (native.downloads.length === before && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 200));
          const file = native.downloads.at(-1);
          while (!native.completed.has(file) && Date.now() < deadline)
            await new Promise((resolve) => setTimeout(resolve, 200));
          assert.match(file, /\.zip$/);
          assert.equal(readFileSync(file).subarray(0, 2).toString(), "PK");
        } else {
          assert.equal(exported.paths.length, 2);
          for (const path of exported.paths) {
            assert.ok(
              realpathSync(path).startsWith(realpathSync(native.exportFolder)),
              path,
            );
            assert.deepEqual(readFileSync(path), png);
          }
        }
        return { savedToLibrary: true, exportedFiles: true };
      } finally {
        const rows = (await query("saves.list", { limit: 10000 })).filter(
          (row) => row.url === page,
        );
        if (rows.length)
          await query("saves.bulkEdit", {
            ids: rows.map((row) => row.id),
            operation: { kind: "purge" },
          });
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  },
  {
    id: "live.mymind-rejects-invalid-key",
    queries: ["accounts.connectMymind", "accounts.list"],
    async verify({ query }) {
      // A well-formed key that mymind does not know: the real API must reject it.
      const result = await query("accounts.connectMymind", {
        kid: "circe-e2e-invalid",
        secret: Buffer.alloc(16, 7).toString("base64"),
      });
      assert.deepEqual(result, {
        ok: false,
        error: "The mymind access key was rejected.",
      });
      assert.ok(
        !(await query("accounts.list")).accounts.some(
          (account) => account.source === "mymind",
        ),
        "a rejected key creates no mymind Source",
      );
      return { invalidKeyRejected: true, noAccountCreated: true };
    },
  },
];

/**
 * Runs only when a real read-only mymind key is supplied through
 * CIRCE_E2E_MYMIND_KID_FILE and CIRCE_E2E_MYMIND_SECRET_FILE. The key stays
 * in those files and the disposable test Library; nothing is logged.
 */
exports.optionalLiveCases = () => {
  const kidFile = process.env.CIRCE_E2E_MYMIND_KID_FILE;
  const secretFile = process.env.CIRCE_E2E_MYMIND_SECRET_FILE;
  if (!kidFile || !secretFile) return [];
  const credential = {
    kid: readFileSync(kidFile, "utf8").trim(),
    secret: readFileSync(secretFile, "utf8").trim(),
  };
  return [
    {
      id: "live.mymind-connect-and-sync",
      queries: [
        "accounts.connectMymind",
        "accounts.list",
        "accounts.disconnect",
      ],
      async verify({ query, run, waitFor, mode }) {
        const connected = await run(
          `window.pond.query("accounts.connectMymind", ${JSON.stringify(credential)})`,
        );
        assert.equal(connected.ok, true, connected.error);
        const id = connected.account.id;
        try {
          await waitFor(
            `window.pond.query('accounts.list',{}).then(value=>value.accounts.some(account=>account.id===${JSON.stringify(id)} && !account.syncing && account.sync.lastSyncedAt))`,
            180000,
          );
          const account = (await query("accounts.list")).accounts.find(
            (row) => row.id === id,
          );
          assert.equal(account.source, "mymind");
          assert.equal(account.sync.lastError ?? null, null);
          const imported = (
            await run("window.pond.query('saves.list',{limit:10000})")
          ).filter((save) => save.source === "mymind").length;
          console.log("E2E_LIVE_MYMIND", mode, `saves=${imported}`);
          return { connected: true, syncedWithoutError: true };
        } finally {
          assert.deepEqual(
            await query("accounts.disconnect", { accountId: id }),
            { ok: true },
          );
        }
      },
    },
  ];
};
