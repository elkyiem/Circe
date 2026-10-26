const assert = require("node:assert/strict");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

exports.verifyBrowserEditing = async function verifyBrowserEditing({
  win,
  run,
  click,
  waitFor,
  snapshot,
  query,
  origin,
  evidence,
  sandbox,
  afterRestart,
}) {
  const proofs = [];
  const persisted = async (id, expected) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const save = await query("saves.get", { id });
      if (
        Object.entries(expected).every(([key, value]) => save?.[key] === value)
      )
        return save;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(`Note ${id} did not persist ${JSON.stringify(expected)}`);
  };
  if (afterRestart) {
    const saved = JSON.parse(
      readFileSync(join(sandbox, "editing-verification-state.json"), "utf8"),
    );
    assert.equal(saved.length, 2);
    for (const note of saved) {
      win.setSize(note.width, note.width === 390 ? 844 : 900);
      await persisted(note.id, {
        title: note.title,
        description: note.description,
      });
      await win.loadURL(`${origin}/save/${note.id}`);
      await waitFor(
        `document.querySelector('[data-save-details] [aria-label="Title"]')?.value === ${JSON.stringify(note.title)} && document.querySelector('[data-save-details] [aria-label="Note"]')?.innerText.includes(${JSON.stringify(note.description)})`,
      );
      await snapshot(`note-restarted-${note.width}`);
    }
    console.log(
      "WEB_EDITING_RESTART_PASSED",
      JSON.stringify({ notes: saved.length }),
    );
    return;
  }
  for (const width of [1280, 390]) {
    win.setSize(width, width === 390 ? 844 : 900);
    await waitFor(`window.innerWidth === ${width}`);
    await win.loadURL(`${origin}/?q=`);
    await waitFor("document.querySelector('[data-library-search]')");
    if (width === 390) {
      if (
        await run(
          "document.querySelector('[data-slot=\"right\"]')?.hasAttribute('data-open')",
        )
      )
        await click('[aria-label="Toggle Details"]');
      if (
        !(await run(
          "document.querySelector('[data-slot=\"window\"]')?.hasAttribute('data-left-open')",
        ))
      )
        await click('[aria-label="Toggle Sidebar"]');
    }
    const previous = new Set(
      (await query("saves.listPage", { limit: 100 })).rows.map(
        (save) => save.id,
      ),
    );
    await click('[aria-label="New"]');
    await waitFor("document.querySelector('[aria-label=\"Search Actions\"]')");
    await win.webContents.insertText("New Note");
    await waitFor(
      "document.querySelectorAll('[role=\"menuitem\"]').length === 1 && document.querySelector('[role=\"menuitem\"]').textContent.includes('New Note')",
    );
    await click('[role="menuitem"]');
    await waitFor("!document.querySelector('[aria-label=\"Search Actions\"]')");
    await waitFor(
      `Array.from(document.querySelectorAll('[data-save-id]')).some(card => !${JSON.stringify([...previous])}.includes(card.dataset.saveId))`,
    );
    const created = (await query("saves.listPage", { limit: 100 })).rows.filter(
      (save) => !previous.has(save.id),
    );
    assert.equal(
      created.length,
      1,
      "The New Note action must create one Save.",
    );
    const [note] = created;
    assert.equal(note.source, "local");
    assert.equal(note.mediaType, "text");
    if (width === 390) await click('[aria-label="Toggle Sidebar"]');
    await waitFor(
      `document.querySelector('[data-save-id="${note.id}"] [role="option"]')`,
    );
    await click(`[data-save-id="${note.id}"] [role="option"]`, 2);
    await waitFor(
      "document.querySelector('[data-save-details] [aria-label=\"Note\"]')",
    );
    if (width === 390) {
      if (
        await run(
          "document.querySelector('[data-slot=\"right\"]')?.hasAttribute('data-open')",
        )
      )
        await click('[aria-label="Toggle Details"]');
      if (
        await run(
          "document.querySelector('[data-slot=\"window\"]')?.hasAttribute('data-left-open')",
        )
      )
        await click('[aria-label="Toggle Sidebar"]');
    }
    const title = `Iris browser note ${width} ${Date.now().toString(36)}`;
    const body = `Written in the real editor at ${width} pixels: café, 水, 🎨.`;
    await click('[data-save-details] [aria-label="Title"]');
    await win.webContents.insertText(title);
    await click('[data-save-details] [aria-label="Note"]');
    await win.webContents.insertText(body);
    await persisted(note.id, { title, description: body });
    await snapshot(`note-edited-${width}`);
    const reloaded = new Promise((resolve) =>
      win.webContents.once("did-finish-load", resolve),
    );
    win.reload();
    await reloaded;
    await waitFor(
      `document.querySelector('[data-save-details] [aria-label="Title"]')?.value === ${JSON.stringify(title)} && document.querySelector('[data-save-details] [aria-label="Note"]')?.innerText.includes(${JSON.stringify(body)})`,
    );
    assert.equal(
      new URL(win.webContents.getURL()).pathname,
      `/save/${note.id}`,
    );
    await snapshot(`note-reloaded-${width}`);
    proofs.push({ id: note.id, title, description: body, width });
  }
  writeFileSync(
    join(sandbox, "editing-verification-state.json"),
    JSON.stringify(proofs, null, 2),
  );
  writeFileSync(
    join(evidence, "editing-results.json"),
    JSON.stringify(proofs, null, 2),
  );
  console.log(
    "WEB_EDITING_PASSED",
    JSON.stringify({
      notes: proofs.length,
      widths: proofs.map((proof) => proof.width),
    }),
  );
};
