/**
 * Shared constraint manipulation helpers used by both `disableAutogain.js`
 * and `overrideMicConstraints.js`. Both modules monkey-patch
 * `getUserMedia` and `applyConstraints` and need to write into the
 * legacy-Chrome and modern WebRTC constraint shapes.
 *
 * Keep this file dependency-free.
 */

function setLegacyChromeConstraint(constraint, name, value) {
  if (constraint.mandatory && name in constraint.mandatory) {
    constraint.mandatory[name] = value;
    return;
  }
  if (constraint.optional) {
    const element = constraint.optional.find((opt) => name in opt);
    if (element) {
      element[name] = value;
      return;
    }
  }
  // `mandatory` options throw errors for unknown keys, so avoid that by
  // setting it under optional.
  if (!constraint.optional) {
    constraint.optional = [];
  }
  constraint.optional.push({ [name]: value });
}

function setConstraint(constraint, name, value) {
  if (constraint.advanced) {
    const element = constraint.advanced.find((opt) => name in opt);
    if (element) {
      element[name] = value;
      return;
    }
  }
  constraint[name] = value;
}

module.exports = { setLegacyChromeConstraint, setConstraint };
