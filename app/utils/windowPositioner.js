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

// Keeps one axis of the window inside the work area. A large margin can only
// push the window as far as the opposite edge, and a window larger than the
// work area is aligned to its top/left edge so the title stays visible.
function clampToArea(coord, areaStart, areaLength, windowLength) {
  const max = areaStart + Math.max(0, areaLength - windowLength);
  return Math.min(Math.max(coord, areaStart), max);
}

/**
 * @returns {{x: number, y: number} | null} null for an unknown position.
 */
function calculatePosition(position, workArea, bounds, margin = 0) {
  const calc = POSITIONS[position];
  if (!calc) return null;
  const { x, y } = calc(workArea, bounds, margin);
  return {
    x: clampToArea(x, workArea.x, workArea.width, bounds.width),
    y: clampToArea(y, workArea.y, workArea.height, bounds.height),
  };
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
