const assert = require("node:assert/strict");

exports.saveCases = [
  {
    id: "saves.edit-search-trash",
    queries: [
      "saves.createManual",
      "saves.get",
      "saves.getMany",
      "saves.bulkEdit",
      "saves.queryPage",
      "saves.queryIds",
      "saves.queryCount",
    ],
    async verify({ query, run, waitFor, click, type, nonce }) {
      const title = `e2esave${nonce.replaceAll("-", "")}`;
      const saves = [];
      for (const suffix of ["A", "B", "C"]) {
        const created = await query("saves.createManual", {
          title: `${title} ${suffix}`,
          note: `Offline note ${suffix}`,
        });
        assert.equal(created.ok, true);
        saves.push(created.id);
      }
      await waitFor(
        `window.pond.query('saves.getMany',{ids:${JSON.stringify(saves)}}).then(rows=>rows.length===3 && rows.every(row=>row.status==='complete'))`,
      );
      const notes = "日本語 café — retained after reload";
      const initial = await query("saves.getMany", { ids: saves });
      assert.equal(
        (
          await query("saves.bulkEdit", {
            ids: saves,
            operation: { kind: "notes", notes },
          })
        ).changed,
        3,
      );
      assert.equal(
        (
          await query("saves.bulkEdit", {
            ids: saves,
            operation: { kind: "rating", rating: 4 },
          })
        ).changed,
        3,
      );
      await run("window.pond.undo()");
      assert.deepEqual(
        (await query("saves.getMany", { ids: saves })).map((row) => row.rating),
        initial.map((row) => row.rating),
      );
      await run("window.pond.redo()");
      const rows = await query("saves.getMany", { ids: saves });
      assert.ok(rows.every((row) => row.notes === notes && row.rating === 4));
      const filter = {
        combinator: "and",
        rules: [{ field: "title", operator: "startsWith", value: title }],
      };
      const request = {
        query: filter,
        sortKey: "title",
        sortDir: "asc",
        limit: 2,
      };
      const first = await query("saves.queryPage", request);
      assert.equal(first.total, 3);
      assert.deepEqual(first.ids, saves.slice(0, 2));
      assert.ok(first.nextCursor);
      const second = await query("saves.queryPage", {
        ...request,
        cursor: first.nextCursor,
      });
      assert.deepEqual(second.ids, saves.slice(2));
      assert.equal(second.nextCursor, null);
      assert.deepEqual(
        (await query("saves.queryIds", { ...request, limit: 500 })).ids,
        saves,
      );
      assert.equal(
        (await query("saves.queryCount", { query: filter })).count,
        3,
      );
      await click("[data-library-search]");
      await run("document.querySelector('[data-library-search]').focus()");
      await waitFor(
        "document.activeElement === document.querySelector('[data-library-search]')",
      );
      await type(title);
      await waitFor(
        `document.querySelectorAll('[data-save-id]').length===3 && ${JSON.stringify(saves)}.every(id=>document.querySelector('[data-save-id="'+id+'"]'))`,
      );
      await run("location.reload()");
      await waitFor(
        `Boolean(window.pond && document.querySelector('[data-library-search]'))`,
      );
      const restored = await query("saves.getMany", { ids: saves });
      assert.deepEqual(
        restored.map((row) => ({ notes: row.notes, rating: row.rating })),
        rows.map((row) => ({ notes: row.notes, rating: row.rating })),
      );
      if (
        await run(
          "Boolean(document.querySelector('[aria-label=\"Clear Search\"]'))",
        )
      )
        await click('[aria-label="Clear Search"]');
      await query("saves.bulkEdit", {
        ids: saves,
        operation: { kind: "trash" },
      });
      assert.ok((await query("saves.get", { id: saves[0] })).deletedAt);
      assert.equal(
        (await query("saves.queryCount", { query: filter })).count,
        0,
      );
      await query("saves.bulkEdit", {
        ids: saves,
        operation: { kind: "untrash" },
      });
      assert.equal(
        (await query("saves.get", { id: saves[0] })).deletedAt,
        null,
      );
      assert.equal(
        (await query("saves.queryCount", { query: filter })).count,
        3,
      );
      await query("saves.bulkEdit", {
        ids: saves,
        operation: { kind: "purge" },
      });
      assert.equal(await query("saves.get", { id: saves[0] }), null);
      return {
        notes,
        rating: 4,
        pages: [first.ids.length, second.ids.length],
        restored: 3,
        purged: true,
        undoRedo: true,
      };
    },
  },
];
