'use strict';

const { execFile } = require('node:child_process');
const os = require('node:os');

const PLAYERS = os.platform() === 'darwin'
  ? [{ cmd: 'afplay', args: (f) => [f] }]
  : os.platform() === 'win32'
    ? [{ cmd: 'powershell', args: (f) => ['-c', `(New-Object System.Media.SoundPlayer '${f}').PlaySync()`] }]
    : [
      { cmd: 'paplay', args: (f) => [f] },
      { cmd: 'pw-play', args: (f) => [f] },
      { cmd: 'aplay', args: (f) => [f] },
    ];

let resolvedPlayer = null;
let detectionDone = false;

function detectPlayer() {
  if (detectionDone) return Promise.resolve(resolvedPlayer);

  const which = os.platform() === 'win32' ? 'where' : 'which';

  return new Promise((resolve) => {
    let remaining = PLAYERS.length;
    if (remaining === 0) {
      detectionDone = true;
      resolve(null);
      return;
    }

    for (const player of PLAYERS) {
      execFile(which, [player.cmd], (err) => {
        if (!err && !resolvedPlayer) {
          resolvedPlayer = player;
        }
        remaining--;
        if (remaining === 0) {
          detectionDone = true;
          resolve(resolvedPlayer);
        }
      });
    }
  });
}

function createPlayer() {
  return {
    async play(filePath) {
      const player = await detectPlayer();
      if (!player) {
        console.warn('[Audio] No audio player available, cannot play sound');
        return;
      }

      return new Promise((resolve, reject) => {
        execFile(player.cmd, player.args(filePath), (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

module.exports = { createPlayer };
