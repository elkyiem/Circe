const assert = require("node:assert/strict");

exports.verifyExtensionSetup = async ({
  win,
  origin,
  run,
  click,
  waitFor,
  snapshot,
  query,
}) => {
  await win.loadURL(`${origin}/sources`);
  await waitFor("document.querySelector('[aria-label=\"New Source\"]')");
  await click('[aria-label="New Source"]');
  await waitFor(
    'Array.from(document.querySelectorAll(\'[role="menuitem"]\')).some(el=>el.innerText.trim()==="New Source")',
  );
  await run(
    `Array.from(document.querySelectorAll('[role="menuitem"]')).find(el=>el.innerText.trim()==='New Source').setAttribute('data-iris-source-test','new')`,
  );
  await click('[data-iris-source-test="new"]');
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Right" });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Right" });
  await waitFor(
    'Array.from(document.querySelectorAll(\'[role="menuitem"]\')).some(el=>el.innerText.trim()==="Twitter")',
  );
  await run(
    `Array.from(document.querySelectorAll('[role="menuitem"]')).find(el=>el.innerText.trim()==='Twitter').setAttribute('data-iris-source-test','twitter')`,
  );
  await click('[data-iris-source-test="twitter"]');
  await waitFor(
    'document.body.innerText.includes("Pair the Iris extension using Connection in its panel, then try again.")',
  );
  assert.equal((await query("accounts.list")).accounts.length, 0);
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
  ]) {
    win.setSize(width, height);
    const text = await snapshot(`extension-pairing-required-${width}`);
    assert.ok(text.includes("No Source session has been connected."));
    assert.ok(!text.includes("isolated window on the host computer"));
  }
  console.log(
    "WEB_EXTENSION_SETUP_BROWSER_PASSED",
    JSON.stringify({
      desktop: true,
      mobile: true,
      pairingRequired: true,
      noAccountCreated: true,
    }),
  );
};
