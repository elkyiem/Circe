const assert = require("node:assert/strict");
const { createNavigation } = require("./navigation.cjs");

/** A 64×32 PNG: left half red, right half blue, so a square crop shows one color. */
const SPLIT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAU0lEQVRYhe3YywkAQAgD0em/6WwVHhYeeBbEXzKtTuM4/a7TKyAdmBHKEucK5YzOI5tPHCkRMRc1OnI6hiaOLJZyTP1QiWCVgK2QuUGLgbt9TacfOkv4ahiaAjkAAAAASUVORK5CYII=";

exports.libraryCases = [
  {
    id: "library.logo-crop-and-tints",
    queries: [
      "library.info",
      "library.identity.cropIcon",
      "library.identity.pondLogo",
      "library.identity.update",
    ],
    async verify({ query, run }) {
      const before = await query("library.info");
      const centerColor = (src) =>
        run(
          `new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); resolve(Array.from(context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data.slice(0, 3))); }; image.onerror = reject; image.src = ${JSON.stringify(src)}; })`,
        );
      const imageSize = (src) =>
        run(
          `new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve([image.naturalWidth, image.naturalHeight]); image.onerror = reject; image.src = ${JSON.stringify(src)}; })`,
        );
      try {
        const cropped = await query("library.identity.cropIcon", {
          src: SPLIT_PNG,
          crop: { x: 32, y: 0, size: 32 },
        });
        assert.equal(cropped.ok, true, JSON.stringify(cropped));
        assert.match(cropped.icon, /^data:image\/png;base64,/);
        assert.deepEqual(await imageSize(cropped.icon), [256, 256]);
        // The crop kept only the right, blue half of the source image.
        assert.deepEqual(await centerColor(cropped.icon), [0, 0, 255]);
        const rejected = await query("library.identity.cropIcon", {
          src: "data:image/png;base64,AAAA",
          crop: { x: 0, y: 0, size: 1 },
        });
        assert.deepEqual(rejected, { ok: false, reason: "invalid_image" });

        const tinted = await query("library.identity.pondLogo", {
          tint: "blueberry",
        });
        assert.equal(tinted.ok, true, JSON.stringify(tinted));
        assert.deepEqual(await imageSize(tinted.icon), [256, 256]);
        const missing = await query("library.identity.pondLogo", {
          tint: "not-a-tint",
        });
        assert.deepEqual(missing, { ok: false, reason: "missing" });

        const updated = await query("library.identity.update", {
          icon: cropped.icon,
        });
        assert.equal(updated.ok, true);
        assert.equal((await query("library.info")).icon, cropped.icon);
        return {
          croppedSize: 256,
          invalidImageRejected: true,
          tintSize: 256,
          unknownTintMissing: true,
          logoPersisted: true,
        };
      } finally {
        await query("library.identity.update", { icon: before.icon ?? null });
      }
    },
  },
  {
    id: "updates.check-dialog",
    queries: ["updates.checkNow"],
    async verify(controls) {
      const { query, run } = controls;
      const { navigate, clickText } = createNavigation(controls);
      const browser = await run(
        "document.documentElement.dataset.runtime === 'browser'",
      );
      // Built E2E bundles are unpackaged, so the host reports a development build.
      const result = await query("updates.checkNow");
      assert.deepEqual(result, { ok: false, reason: "dev_build" });
      await navigate(
        "/settings/general",
        "Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === 'Check Now')",
      );
      const description = browser
        ? "Look for a newer build for your host computer."
        : "Look for a newer build.";
      assert.ok(
        await run(
          `document.body.innerText.includes(${JSON.stringify(description)})`,
        ),
      );
      await clickText("button", "Check Now");
      const message = browser
        ? "This host runs from source. Updates are applied when the Circé host is rebuilt."
        : "Updates are only available in packaged builds.";
      await controls.waitFor(
        `Boolean(document.querySelector('[role=dialog], [role=alertdialog]')) && document.body.innerText.includes(${JSON.stringify(message)})`,
      );
      await controls.snapshot(`${controls.mode}-update-check`);
      await controls.press("Escape");
      await controls.waitFor(
        "!document.querySelector('[role=dialog], [role=alertdialog]')",
      );
      await navigate("/", "document.querySelector('[data-library-search]')");
      return { devBuildExplained: true, dialogDismissed: true };
    },
  },
];
