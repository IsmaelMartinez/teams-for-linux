'use strict';

const { execFile } = require('node:child_process');
const os = require('node:os');

const simpleArgs = (f) => [f];

const PLAYERS = os.platform() === 'darwin'
  ? [{ cmd: 'afplay', args: simpleArgs }]
  : os.platform() === 'win32'
    ? [{ cmd: 'powershell', args: (f) => ['-c', '(New-Object System.Media.SoundPlayer $args[0]).PlaySync()', '-args', f] }]
    : [
      { cmd: 'paplay', args: simpleArgs },
      { cmd: 'pw-play', args: simpleArgs },
      { cmd: 'aplay', args: simpleArgs },
    ];

let detectionPromise = null;

function detectPlayer() {
  if (detectionPromise) return detectionPromise;

  const which = os.platform() === 'win32' ? 'where' : 'which';

  detectionPromise = new Promise((resolve) => {
    if (PLAYERS.length === 0) {
      resolve(null);
      return;
    }

    const results = new Array(PLAYERS.length).fill(null);
    let remaining = PLAYERS.length;

    for (let i = 0; i < PLAYERS.length; i++) {
      execFile(which, [PLAYERS[i].cmd], (err) => {
        if (!err) {
          results[i] = PLAYERS[i];
        }
        remaining--;
        if (remaining === 0) {
          resolve(results.find(Boolean) || null);
        }
      });
    }
  });

  return detectionPromise;
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
