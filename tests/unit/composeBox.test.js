const test = require("node:test");
const assert = require("node:assert");

const { COMPOSE_SELECTORS, findCompose } = require("../../app/helpers/composeBox");

function docWith(matches) {
  const asked = [];
  return {
    asked,
    querySelector: (selector) => {
      asked.push(selector);
      return matches[selector] ?? null;
    },
  };
}

test("findCompose returns the first match of the cascade, most specific first", () => {
  const specific = { id: "specific" };
  const loose = { id: "loose" };
  const doc = docWith({ b: specific, c: loose });

  assert.strictEqual(findCompose(doc, ["a", "b", "c"]), specific);
  assert.deepStrictEqual(doc.asked, ["a", "b"], "stops at the first hit");
});

test("findCompose returns null when nothing matches", () => {
  assert.strictEqual(findCompose(docWith({}), COMPOSE_SELECTORS), null);
  assert.strictEqual(findCompose(docWith({}), []), null);
});

test("findCompose survives serialisation into the renderer", () => {
  // deepLinkRouter injects `findCompose.toString()`: it must not close over
  // anything in its module.
  const revived = new Function(`return ${findCompose.toString()}`)();
  const hit = {};

  assert.strictEqual(revived(docWith({ x: hit }), ["x"]), hit);
});

test("COMPOSE_SELECTORS is a non-empty list of selector strings", () => {
  assert.ok(COMPOSE_SELECTORS.length > 0);
  for (const selector of COMPOSE_SELECTORS) {
    assert.strictEqual(typeof selector, "string");
  }
});
