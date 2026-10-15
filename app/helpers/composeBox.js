// The chat compose box, most specific selector first. Teams can rename any of
// these without notice, hence the cascade; a miss is for the caller to absorb.
const COMPOSE_SELECTORS = [
  'div[id^="new-message-"]',
  'div[contenteditable="true"][role="textbox"][aria-label*="message" i]',
  'div[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"][aria-label*="message" i]',
  '[data-tid*="ckeditor"]',
  '[data-tid*="message-area"]',
  '.ck-editor__editable',
];

/**
 * First element matching the cascade, or null. Self-contained on purpose: the
 * main process serialises it into the renderer (`deepLinkRouter.focusCompose`),
 * so it must not close over anything in this module.
 *
 * @param {Document} doc
 * @param {string[]} selectors - Most specific first
 * @returns {Element|null}
 */
function findCompose(doc, selectors) {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el) {
      return el;
    }
  }
  return null;
}

module.exports = { COMPOSE_SELECTORS, findCompose };
