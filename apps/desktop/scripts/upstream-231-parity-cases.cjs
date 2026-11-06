const assert = require("node:assert/strict");
const {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");

const ids = {
  desktop: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  web: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
};

/** Historical jobs exercise the real durable store without opening OS file dialogs. */
exports.transferFixtures = (root) =>
  Object.entries(ids).map(([mode, id]) => ({
    id,
    request: {
      kind: "copy_library",
      origin: root,
      destination: join(root, `${mode}-transfer`),
    },
    status: mode === "desktop" ? "failed" : "completed",
    phase: "Finished",
    completed: 1,
    total: 1,
    bytes: 0,
    currentFile: null,
    error: mode === "desktop" ? "Disposable transfer fixture failed." : null,
    startedAt: 1,
    updatedAt: 1,
  }));

exports.verify231Parity = async ({
  run,
  waitFor,
  click,
  snapshot,
  mode,
  root,
  jobsFile,
  directory,
}) => {
  const query = (name, params = {}) =>
    run(`window.pond.query(${JSON.stringify(name)},${JSON.stringify(params)})`);
  const control = async (selector, label) => {
    const matches = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(node=>node.textContent.trim()===${JSON.stringify(label)} || Array.from(node.querySelectorAll("span")).some(span=>span.textContent.trim()===${JSON.stringify(label)}))`;
    await waitFor(`Boolean(${matches})`);
    await run(
      `(() => {document.querySelectorAll('[data-parity-231]').forEach(node=>node.removeAttribute('data-parity-231'));(${matches}).setAttribute('data-parity-231','true');})()`,
    );
    return '[data-parity-231="true"]';
  };
  const prefs = await query("settings.getPrefs");
  const save = (await query("saves.list", { limit: 10000 })).find(
    (row) =>
      row.status === "complete" &&
      row.title?.startsWith("Parity carousel") &&
      existsSync(join(root, "items", `${row.id}.info`)),
  );
  assert.ok(save, "Expected a disposable carousel Save");
  const path = join(root, "items", `${save.id}.info`);
  const backup = `${path}.parity-backup`;
  let hidden = false;
  let rootHidden = false;
  const rootBackup = `${root}.parity-backup`;
  try {
    await query("settings.setPrefs", {
      ai: {
        semanticSearch: false,
        enableCaption: false,
        enableOcr: false,
        enableTranscript: false,
        enableClip: false,
        enableSensitiveContent: false,
        enableAutoTitle: false,
      },
    });
    renameSync(path, backup);
    hidden = true;
    const scan = await query("library.rescan");
    assert.ok(scan.missingFiles.some((row) => row.id === save.id));
    assert.equal((await query("saves.get", { id: save.id })).status, "failed");
    assert.equal((await query("enrichment.run", { kind: "scan" })).ok, true);
    await waitFor(
      `window.pond.query('enrichment.status',{}).then(status=>status.missingOriginals?.some(row=>row.id===${JSON.stringify(save.id)}))`,
    );
    await click(await control('[aria-label="Settings"] button', "Processing"));
    await waitFor(
      `document.body.innerText.includes('Files missing') && document.body.innerText.includes(${JSON.stringify(save.title)})`,
    );
    await snapshot(`${mode}-missing-original`);
    await click(await control("button", "Repair Invalid Content"));
    await waitFor("Boolean(document.querySelector('[role=dialog]'))");
    await waitFor(
      `document.querySelector('[role=dialog]').innerText.includes(${JSON.stringify(save.title)})`,
    );
    await snapshot(`${mode}-repair-preview`);
    await click(await control('[role="dialog"] button', "Cancel"));
    await waitFor("!document.querySelector('[role=dialog]')");
    assert.equal(
      existsSync(path),
      false,
      "Missing originals must not be recreated by enrichment",
    );
    renameSync(backup, path);
    hidden = false;
    await query("library.rescan");
    assert.equal(
      (await query("saves.get", { id: save.id })).status,
      "complete",
    );
    await query("enrichment.run", { kind: "scan" });
    await waitFor(
      `window.pond.query('enrichment.status',{}).then(status=>!status.missingOriginals?.some(row=>row.id===${JSON.stringify(save.id)}))`,
    );

    renameSync(root, rootBackup);
    rootHidden = true;
    // The host must notice displacement without a client asking it to rescan.
    await waitFor(
      `window.pond.query('saves.get',{id:${JSON.stringify(save.id)}}).then(row=>row.status==='failed')`,
    );
    const denied = await run(
      `window.pond.query('saves.patchDerived',{id:${JSON.stringify(save.id)},patch:{caption:'Should not write'}}).then(value=>({value})).catch(error=>({error:error.message}))`,
    );
    assert.ok(denied.error?.includes("missing") || denied.value?.ok === false);
    assert.equal(
      existsSync(root),
      false,
      "A displaced Library must not be recreated",
    );
    renameSync(rootBackup, root);
    rootHidden = false;
    await waitFor(
      `window.pond.query('saves.get',{id:${JSON.stringify(save.id)}}).then(row=>row.status==='complete')`,
    );
    await click(await control("button", "Exit settings"));
    await click(await control("button", "Downloads"));
    const id = ids[mode];
    const job = (await query("transferJobs.list")).find((row) => row.id === id);
    assert.ok(job);
    const destination = job.request.destination;
    const row = `Array.from(document.querySelectorAll('[aria-label="Library transfers"] article')).find(node=>node.innerText.includes(${JSON.stringify(destination)}))`;
    await waitFor(`Boolean(${row})`);
    await run(
      `(${row}).querySelectorAll('button').forEach(node=>{if(node.textContent.trim()==='Dismiss')node.setAttribute('data-parity-231','dismiss');})`,
    );
    await snapshot(`${mode}-transfer-dismiss`);
    await click('[data-parity-231="dismiss"]');
    await waitFor(
      `window.pond.query('transferJobs.list',{}).then(rows=>!rows.some(row=>row.id===${JSON.stringify(id)}))`,
    );
    // The store removes its in-memory entry before the durable write settles.
    await waitFor(`!(${row})`);
    assert.ok(
      !JSON.parse(readFileSync(jobsFile, "utf8")).some((row) => row.id === id),
    );
    const result = {
      missingOriginalDetected: true,
      hostProcessingDetails: true,
      repairPreview: true,
      restoredOriginalRecovers: true,
      durableTransferDismissal: true,
      displacedLibraryWriteGuard: true,
      returnedLibraryRecovers: true,
    };
    writeFileSync(
      join(directory, `${mode}-231-parity.json`),
      JSON.stringify(result, null, 2),
    );
    console.log("UPSTREAM_231_PARITY_PASSED", mode, JSON.stringify(result));
    return result;
  } finally {
    if (rootHidden) {
      if (existsSync(root)) renameSync(root, `${root}.parity-recreated`);
      renameSync(rootBackup, root);
    }
    if (hidden) renameSync(backup, path);
    await query("settings.setPrefs", { ai: prefs.ai });
  }
};
