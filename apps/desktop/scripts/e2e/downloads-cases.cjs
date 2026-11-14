const assert = require("node:assert/strict");
const { createNavigation } = require("./navigation.cjs");

exports.downloadsCases = [
  {
    // Probing a real link installs yt-dlp from GitHub; that path belongs to live tests.
    id: "downloads.dialog-offline-validation",
    queries: [
      "downloader.probe",
      "downloader.clipboardLinks",
      "downloader.exportFolder",
    ],
    async verify(controls) {
      const { query, run, waitFor, click, press, type } = controls;
      const { clickText } = createNavigation(controls);
      const browser = await run(
        "document.documentElement.dataset.runtime === 'browser'",
      );
      const invalid = await query("downloader.probe", { url: "not a link" });
      assert.equal(invalid.ok, false);
      assert.equal(invalid.reason, "invalid");
      const clipboard = await query("downloader.clipboardLinks");
      assert.ok(Array.isArray(clipboard.urls));
      assert.ok(
        clipboard.urls.every((url) => /^https?:\/\//.test(url)),
        JSON.stringify(clipboard),
      );
      const folder = await query("downloader.exportFolder");
      // Browser exports arrive through the visiting device's own downloads.
      if (browser)
        assert.deepEqual(folder, { path: "", name: "this device's Downloads" });
      else assert.ok(folder.path.length > 0 && folder.name.length > 0);

      await click('[aria-label="New"]');
      // The New menu nests its actions; its search field reaches them directly.
      await waitFor("document.activeElement?.tagName === 'INPUT'");
      await type("Download");
      await clickText('[role="menuitem"]', "Download Video or Audio");
      await waitFor("Boolean(document.querySelector('[data-page=\"link\"]'))");
      await run(
        '(() => { const field = document.querySelector(\'[data-page="link"] [aria-label="Link"]\'); field.focus(); field.select(); return true; })()',
      );
      await type("not a link");
      const field =
        'document.querySelector(\'[data-page="link"] [aria-label="Link"]\')';
      assert.equal(await run(`${field}.validity.typeMismatch`), true);
      await run(`(() => { ${field}.select(); return true; })()`);
      // A valid URL that is not a web link reaches Pond's own validation.
      await type("ftp://example.invalid/clip.mp4");
      await clickText('[data-page="link"] button', "Continue");
      await waitFor(
        "document.querySelector('[data-page=\"link\"]').innerText.includes('Paste a link that starts with https://.')",
      );
      await controls.snapshot(`${controls.mode}-download-dialog`);
      await press("Escape");
      await waitFor("!document.querySelector('[data-page=\"link\"]')");
      return {
        invalidReason: invalid.reason,
        clipboardLinksAreUrls: true,
        exportFolderNamed: true,
        dialogValidatesLinks: true,
      };
    },
  },
];
