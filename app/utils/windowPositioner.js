'use strict';

const { screen } = require('electron');

const POSITIONS = {
  topRight: (workArea, bounds) => ({
    x: workArea.x + workArea.width - bounds.width,
    y: workArea.y,
  }),
  bottomRight: (workArea, bounds) => ({
    x: workArea.x + workArea.width - bounds.width,
    y: workArea.y + workArea.height - bounds.height,
  }),
};

function moveWindow(window, position) {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const calc = POSITIONS[position];
  if (!calc) {
    console.warn(`[WindowPositioner] Unknown position: ${position}`);
    return;
  }
  const coords = calc(display.workArea, bounds);
  window.setPosition(coords.x, coords.y, false);
}

module.exports = { moveWindow };
