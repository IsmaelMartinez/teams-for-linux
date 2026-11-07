'use strict';

const { screen } = require('electron');

// Each corner keeps `margin` pixels from the edges of the display's work area.
// The margin also helps where the reported work area includes a panel or dock
// (seen on some multi-monitor X11 setups), which would otherwise be covered.
const POSITIONS = {
  topRight: (workArea, bounds, margin) => ({
    x: workArea.x + workArea.width - bounds.width - margin,
    y: workArea.y + margin,
  }),
  bottomRight: (workArea, bounds, margin) => ({
    x: workArea.x + workArea.width - bounds.width - margin,
    y: workArea.y + workArea.height - bounds.height - margin,
  }),
  topLeft: (workArea, bounds, margin) => ({
    x: workArea.x + margin,
    y: workArea.y + margin,
  }),
  bottomLeft: (workArea, bounds, margin) => ({
    x: workArea.x + margin,
    y: workArea.y + workArea.height - bounds.height - margin,
  }),
};

/**
 * @returns {{x: number, y: number} | null} null for an unknown position.
 */
function calculatePosition(position, workArea, bounds, margin = 0) {
  const calc = POSITIONS[position];
  return calc ? calc(workArea, bounds, margin) : null;
}

function moveWindow(window, position, margin = 0) {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const coords = calculatePosition(position, display.workArea, bounds, margin);
  if (!coords) {
    console.warn(`[WindowPositioner] Unknown position: ${position}`);
    return;
  }
  window.setPosition(coords.x, coords.y, false);
}

module.exports = { moveWindow, calculatePosition };
