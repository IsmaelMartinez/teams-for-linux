"use strict";

/**
 * Build-time fix for Wayland screen sharing in the snap (#3180, #3066).
 *
 * Chromium's WebRTC PipeWire capturer dlopen()s `libpipewire-0.3.so.0` at the
 * moment a share starts. The x64 snap is packed from electron-builder's frozen
 * 2019 template on `base: core22` with the `gnome-3-28-1804` runtime, and none
 * of the three ships libpipewire. The dlopen fails, `CanUsePipeWire()` is false,
 * and Chromium falls back to the X11 capturer. On a Wayland session that capturer
 * either fails at once (`NotReadableError: Could not start video source`) or
 * captures a black frame, whatever ozone platform or config the user picks.
 *
 * The fix bundles the client library from Ubuntu 22.04 (the release core22 is
 * built from) into the snap:
 *
 *   - `libpipewire-0.3.so.0` goes next to the Electron binary, whose RPATH is
 *     `$ORIGIN`, so Chromium's dlopen finds it without touching LD_LIBRARY_PATH.
 *   - The SPA plugins, the client modules and `client.conf` go under `pipewire/`.
 *     `build.snap.environment` points SPA_PLUGIN_DIR, PIPEWIRE_MODULE_DIR and
 *     PIPEWIRE_CONFIG_DIR at them.
 *
 * The capture stream itself still comes from the host: xdg-desktop-portal hands
 * the snap a PipeWire fd, so no extra plug is needed. Every library these files
 * link against (libdbus, libsystemd, libudev, libstdc++) is already in core22.
 *
 * Why not `stagePackages`: adding packages makes electron-builder drop the x64
 * template and pack through snapcraft instead (coreLegacy.js isUseTemplateApp),
 * which is a much larger change to how the snap is built.
 *
 * Why only snap-only builds: afterPack runs once on the shared unpacked app,
 * before any target is built. In a run that also builds deb, rpm or AppImage,
 * a libpipewire next to the binary would shadow the host's newer copy in those
 * packages too, so the bundling is skipped there with a warning. CI builds the
 * snap on its own (`npm run dist:linux:snap`).
 */

const { createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { Arch } = require("builder-util");

const execFileAsync = promisify(execFile);

const PIPEWIRE_VERSION = "0.3.48-1ubuntu3.2";

// Launchpad keeps every published file, unlike archive.ubuntu.com, which drops
// superseded versions from the pool. Checksums match the jammy-updates index.
const PACKAGES_BY_ARCH = new Map([
  [
    Arch.x64,
    {
      triplet: "x86_64-linux-gnu",
      packages: {
        "libpipewire-0.3-0": "e0e1b8d194994c0859a9131284344fc30101a0b00aaa823576f2096fa24bdfe5",
        "libpipewire-0.3-modules": "f70c89ac73ade1d409762112800b3485ee6f93a9c1d22c0829255131a783f453",
        "libspa-0.2-modules": "2a457174722ca57b6f92a0141548a63702c235e4b1f6f9379f10954e680ef8b2",
        "pipewire-bin": "b7aea828ee8d72a100a39db1ed1f690adb62b71a8008090493609cf80114d84a",
      },
    },
  ],
]);

// The modules client.conf loads. Server-side modules are left out.
const CLIENT_MODULES = [
  "rt",
  "protocol-native",
  "client-node",
  "client-device",
  "adapter",
  "metadata",
  "session-manager",
];

// SPA plugin directories a capture client needs.
const SPA_PLUGIN_DIRS = ["support", "videoconvert"];

const CLIENT_CONFIGS = ["client.conf", "client-rt.conf"];

// Must match the paths in build.snap.environment (package.json).
const BUNDLE_DIR = "pipewire";

function debFileName(name, arch) {
  return `${name}_${PIPEWIRE_VERSION}_${arch === Arch.x64 ? "amd64" : Arch[arch]}.deb`;
}

function packageUrl(fileName) {
  return `https://launchpad.net/ubuntu/+archive/primary/+files/${fileName}`;
}

/**
 * Fails unless `data` hashes to `expected`, so a tampered or moved file never
 * lands in the snap.
 */
function verifyChecksum(fileName, data, expected) {
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== expected) {
    throw new Error(`snap PipeWire bundle: checksum mismatch for ${fileName} (expected ${expected}, got ${actual})`);
  }
}

async function downloadPackage(fileName, expectedSha256, destDir) {
  const response = await fetch(packageUrl(fileName));
  if (!response.ok) {
    throw new Error(`snap PipeWire bundle: download of ${fileName} failed with HTTP ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  verifyChecksum(fileName, data, expectedSha256);
  const debPath = path.join(destDir, fileName);
  await writeFile(debPath, data);
  return debPath;
}

async function copyMatching(srcDir, destDir, predicate) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir);
  const picked = entries.filter(predicate);
  if (picked.length === 0) {
    throw new Error(`snap PipeWire bundle: nothing to copy from ${srcDir}`);
  }
  for (const entry of picked) {
    await copyFile(path.join(srcDir, entry), path.join(destDir, entry));
  }
}

/**
 * Copies the client library, modules, SPA plugins and config out of an
 * extracted package root into the unpacked app directory.
 */
async function installBundle(extractedRoot, appOutDir, triplet) {
  const libDir = path.join(extractedRoot, "usr", "lib", triplet);
  const bundleDir = path.join(appOutDir, BUNDLE_DIR);

  // Copied under the soname Chromium dlopens; the versioned file is the real one.
  const libraries = await readdir(libDir);
  const realLibrary = libraries.find((entry) => /^libpipewire-0\.3\.so\.0\.\d+\.\d+$/.test(entry));
  if (!realLibrary) {
    throw new Error(`snap PipeWire bundle: libpipewire-0.3.so.0.* not found in ${libDir}`);
  }
  await copyFile(path.join(libDir, realLibrary), path.join(appOutDir, "libpipewire-0.3.so.0"));

  const moduleNames = new Set(CLIENT_MODULES.map((name) => `libpipewire-module-${name}.so`));
  await copyMatching(path.join(libDir, "pipewire-0.3"), path.join(bundleDir, "modules"), (entry) =>
    moduleNames.has(entry),
  );

  for (const pluginDir of SPA_PLUGIN_DIRS) {
    await copyMatching(path.join(libDir, "spa-0.2", pluginDir), path.join(bundleDir, "spa-0.2", pluginDir), (entry) =>
      entry.endsWith(".so"),
    );
  }

  const configs = new Set(CLIENT_CONFIGS);
  await copyMatching(path.join(extractedRoot, "usr", "share", "pipewire"), path.join(bundleDir, "conf"), (entry) =>
    configs.has(entry),
  );
}

/**
 * Downloads the pinned jammy PipeWire packages for `arch` and installs the
 * client side of them into `appOutDir`. Architectures without pinned packages
 * are skipped.
 *
 * @param {string} appOutDir electron-builder's unpacked app directory.
 * @param {number} arch electron-builder Arch enum value.
 */
async function bundleSnapPipewire(appOutDir, arch) {
  const spec = PACKAGES_BY_ARCH.get(arch);
  if (!spec) {
    console.warn(`⚠️  No PipeWire packages pinned for ${Arch[arch]}; snap screen sharing on Wayland stays X11-only`);
    return false;
  }

  console.log("🔄 Bundling libpipewire into the snap (#3180)...");
  const workDir = await mkdtemp(path.join(tmpdir(), "snap-pipewire-"));
  try {
    const extractedRoot = path.join(workDir, "root");
    for (const [name, sha256] of Object.entries(spec.packages)) {
      const debPath = await downloadPackage(debFileName(name, arch), sha256, workDir);
      await execFileAsync("dpkg-deb", ["-x", debPath, extractedRoot]);
    }
    await installBundle(extractedRoot, appOutDir, spec.triplet);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
  console.log(`✅ libpipewire ${PIPEWIRE_VERSION} bundled`);
  return true;
}

module.exports = {
  bundleSnapPipewire,
  installBundle,
  verifyChecksum,
  debFileName,
  packageUrl,
  PACKAGES_BY_ARCH,
  CLIENT_MODULES,
  BUNDLE_DIR,
};
