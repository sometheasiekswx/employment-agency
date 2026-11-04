const assert = require('node:assert/strict');

// A click or key press may finish before Chrome completes the native decision.
// Keep the next interaction behind all three parts of this confirmation.
async function decideDialog(page, trigger, accept, message = 'Discard unsaved changes?') {
  const handled = page.waitForEvent('dialog').then(async confirmation => {
    assert.equal(confirmation.type(), 'confirm');
    assert.equal(confirmation.message(), message);
    if (accept) await confirmation.accept();
    else await confirmation.dismiss();
  });
  await Promise.all([handled, trigger()]);
}

module.exports = { decideDialog };
