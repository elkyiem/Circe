const assert = require("node:assert/strict");

exports.organizationCases = [
  {
    id: "tags.groups-and-rename",
    queries: [
      "tags.create",
      "tags.setForSave",
      "tags.rename",
      "tags.merge",
      "tags.update",
      "tags.list",
      "tags.delete",
      "tagGroups.create",
      "tagGroups.addTags",
      "tagGroups.list",
      "tagGroups.rename",
      "tagGroups.update",
      "tagGroups.removeTag",
      "tagGroups.delete",
      "saves.createManual",
      "saves.get",
      "saves.bulkEdit",
    ],
    async verify({ query, nonce }) {
      const tag = `日本語 café ${nonce}`;
      const renamed = `Ελληνικά ${nonce}`;
      const group = `Ελληνικά group ${nonce}`;
      const nextGroup = `Ελληνικά renamed ${nonce}`;
      const save = await query("saves.createManual", {
        title: `Tags ${nonce}`,
        note: "Tag fixture",
      });
      assert.equal(save.ok, true);
      assert.equal((await query("tags.create", { name: tag })).ok, true);
      await query("tags.setForSave", { saveId: save.id, tags: [tag] });
      await query("tags.rename", { from: tag, to: renamed });
      assert.deepEqual((await query("saves.get", { id: save.id })).tags, [
        renamed,
      ]);
      await query("tags.update", {
        name: renamed,
        patch: { starred: true, description: "Retain Unicode" },
      });
      assert.equal(
        (await query("tags.list")).find((row) => row.name === renamed)
          .description,
        "Retain Unicode",
      );
      assert.equal(
        (await query("tagGroups.create", { name: group, color: "blue" })).ok,
        true,
      );
      await query("tagGroups.addTags", { tags: [renamed], group });
      assert.deepEqual(
        (await query("tagGroups.list")).find((row) => row.name === group)
          .tagNames,
        [renamed],
      );
      await query("tagGroups.rename", { from: group, to: nextGroup });
      await query("tagGroups.update", {
        name: nextGroup,
        patch: { description: "Grouped tags", collapsed: true },
      });
      const updated = (await query("tagGroups.list")).find(
        (row) => row.name === nextGroup,
      );
      assert.equal(updated.description, "Grouped tags");
      assert.equal(updated.collapsed, true);
      await query("tagGroups.removeTag", { tag: renamed, group: nextGroup });
      assert.deepEqual(
        (await query("tagGroups.list")).find((row) => row.name === nextGroup)
          .tagNames,
        [],
      );
      await query("tags.create", { name: tag });
      await query("tags.merge", { from: renamed, to: tag });
      assert.deepEqual((await query("saves.get", { id: save.id })).tags, [tag]);
      await query("tagGroups.delete", { name: nextGroup });
      await query("tags.delete", { name: tag });
      assert.deepEqual((await query("saves.get", { id: save.id })).tags, []);
      assert.ok(
        !(await query("tagGroups.list")).some((row) => row.name === nextGroup),
      );
      await query("saves.bulkEdit", {
        ids: [save.id],
        operation: { kind: "purge" },
      });
      return {
        renamedOnSave: true,
        mergedOnSave: true,
        removedOnSave: true,
        groupMembership: [1, 0],
      };
    },
  },
  {
    id: "folders.hierarchy-membership",
    queries: [
      "folders.create",
      "folders.list",
      "folders.rename",
      "folders.move",
      "folders.addSaves",
      "folders.assign",
      "folders.memberships",
      "folders.metadata.set",
      "folders.metadata.get",
      "folders.rules.set",
      "folders.rules.get",
      "folders.delete",
      "saves.createManual",
      "saves.get",
      "saves.bulkEdit",
    ],
    async verify({ query, nonce }) {
      const parent = await query("folders.create", { name: `Parent ${nonce}` });
      const child = await query("folders.create", {
        name: `Child ${nonce}`,
        parentId: parent.id,
      });
      const save = await query("saves.createManual", {
        title: `Folder ${nonce}`,
        note: "Folder fixture",
      });
      assert.equal(save.ok, true);
      await query("folders.rename", { id: child.id, name: `Renamed ${nonce}` });
      const renamed = (await query("folders.list")).find(
        (row) => row.id === child.id,
      );
      assert.equal(renamed.name, `Renamed ${nonce}`);
      assert.equal(renamed.parentId, parent.id);
      await query("folders.addSaves", {
        folderId: child.id,
        saveIds: [save.id],
      });
      assert.ok(
        (await query("folders.memberships")).some(
          (row) => row.saveId === save.id && row.folderId === child.id,
        ),
      );
      await query("folders.assign", {
        saveIds: [save.id],
        addIds: [parent.id],
        removeIds: [child.id],
      });
      assert.deepEqual(
        (await query("folders.memberships"))
          .filter((row) => row.saveId === save.id)
          .map((row) => row.folderId),
        [parent.id],
      );
      const metadata = {
        description: "日本語 café",
        externalLink: "https://example.invalid/folder",
      };
      await query("folders.metadata.set", { folderId: child.id, ...metadata });
      const stored = await query("folders.metadata.get", {
        folderId: child.id,
      });
      assert.equal(stored.description, metadata.description);
      assert.equal(stored.externalLink, metadata.externalLink);
      await query("folders.rules.set", {
        id: parent.id,
        tags: [`rule-${nonce}`],
        applyExisting: true,
      });
      assert.ok(
        (await query("saves.get", { id: save.id })).tags.includes(
          `rule-${nonce}`,
        ),
      );
      assert.ok(
        JSON.stringify(
          await query("folders.rules.get", { id: parent.id }),
        ).includes(`rule-${nonce}`),
      );
      await query("folders.move", { id: child.id, parentId: null });
      assert.equal(
        (await query("folders.list")).find((row) => row.id === child.id)
          .parentId,
        null,
      );
      await query("folders.delete", { id: parent.id });
      assert.ok(
        !(await query("folders.memberships")).some(
          (row) => row.folderId === parent.id,
        ),
      );
      assert.ok(await query("saves.get", { id: save.id }));
      await query("folders.delete", { id: child.id });
      await query("saves.bulkEdit", {
        ids: [save.id],
        operation: { kind: "purge" },
      });
      await query("tags.delete", { name: `rule-${nonce}` });
      return {
        nested: true,
        movedToRoot: true,
        membershipReassigned: true,
        metadata,
        ruleApplied: true,
        deletionRetainsSave: true,
      };
    },
  },
  {
    id: "saved-views.groups-and-filters",
    queries: [
      "savedViews.create",
      "savedViews.rename",
      "savedViews.update",
      "savedViews.list",
      "savedViews.reorder",
      "savedViews.delete",
    ],
    async verify({ query, nonce }) {
      const filter = {
        combinator: "and",
        rules: [{ field: "rating", operator: "gte", value: 3 }],
      };
      const group = await query("savedViews.create", {
        name: `Group ${nonce}`,
        kind: "group",
      });
      assert.equal(group.ok, true);
      const smart = await query("savedViews.create", {
        name: `Smart ${nonce}`,
        kind: "smart_folder",
        parentId: group.id,
        query: filter,
      });
      const view = await query("savedViews.create", {
        name: `View ${nonce}`,
        kind: "saved_view",
        parentId: group.id,
        query: filter,
        layout: "grid",
        sortKey: "title",
        sortDir: "asc",
      });
      assert.equal(smart.ok, true);
      assert.equal(view.ok, true);
      await query("savedViews.rename", {
        id: view.id,
        name: `Renamed ${nonce}`,
      });
      await query("savedViews.update", {
        id: view.id,
        patch: { layout: "list", sortDir: "desc" },
      });
      await query("savedViews.reorder", { ids: [view.id, smart.id] });
      const rows = await query("savedViews.list");
      const saved = rows.find((row) => row.id === view.id);
      assert.equal(saved.name, `Renamed ${nonce}`);
      assert.equal(saved.layout, "list");
      assert.equal(saved.sortDir, "desc");
      assert.deepEqual(saved.query, filter);
      assert.equal(
        rows.find((row) => row.id === smart.id).kind,
        "smart_folder",
      );
      assert.ok(
        saved.sortOrder < rows.find((row) => row.id === smart.id).sortOrder,
      );
      const cycle = await query("savedViews.update", {
        id: group.id,
        patch: { parentId: group.id },
      });
      assert.equal(cycle.ok, false);
      await query("savedViews.delete", { id: group.id });
      const promoted = (await query("savedViews.list")).filter((row) =>
        [smart.id, view.id].includes(row.id),
      );
      assert.equal(promoted.length, 2);
      assert.ok(promoted.every((row) => row.parentId === null));
      await query("savedViews.delete", { id: smart.id });
      await query("savedViews.delete", { id: view.id });
      return {
        kinds: ["group", "smart_folder", "saved_view"],
        filter,
        layout: saved.layout,
        sortDir: saved.sortDir,
        cycleRejected: true,
        promoted: promoted.length,
      };
    },
  },
];
