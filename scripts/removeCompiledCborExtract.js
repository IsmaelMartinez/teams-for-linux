"use strict";

/**
 * Drops the cbor-extract addon that electron-builder compiles on the build
 * machine (#3192).
 *
 * cbor-x loads cbor-extract at startup, and its loader prefers
 * `build/Release` over the upstream prebuilt packages. Compiled on the
 * ubuntu-26.04 runner, that copy contains AVX instructions in its init
 * function, so the app dies with SIGILL on CPUs without AVX. With the local
 * build gone, the loader picks the portable prebuilt from
 * `@cbor-extract/cbor-extract-<platform>-<arch>`, and if none fits, cbor-x
 * falls back to its JavaScript decoder: the addon is only an accelerator.
 */

const { rm } = require("node:fs/promises");
const path = require("node:path");

const COMPILED_BUILD_DIR = path.join(
  "resources",
  "app.asar.unpacked",
  "node_modules",
  "cbor-extract",
  "build",
);

async function removeCompiledCborExtract(appOutDir) {
  await rm(path.join(appOutDir, COMPILED_BUILD_DIR), { recursive: true, force: true });
  console.log("✅ Removed the locally compiled cbor-extract addon (#3192)");
}

module.exports = { removeCompiledCborExtract, COMPILED_BUILD_DIR };
