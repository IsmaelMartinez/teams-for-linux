"use strict";

/**
 * Build-time workaround for the silent snap launch failure in issue #2946.
 *
 * With `build.snap.base = "core22"`, electron-builder 26.15.7 packs snaps through
 * `app-builder-lib/out/targets/snap/coreLegacy.js`, which unconditionally makes
 * `command.sh` run the snapcraft desktop-helper chain:
 *
 *   #!/bin/bash -e
 *   exec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" \
 *        "$SNAP/desktop-gnome-specific.sh" "$SNAP/teams-for-linux" ...
 *
 * `desktop-common.sh` also starts with `#!/bin/bash -e` and contains:
 *
 *   if [ -d "$HOME/$b" ]; then
 *     rmdir "$HOME/$b" 2> /dev/null
 *   fi
 *
 * `rmdir` returns 1 on a non-empty directory, `2> /dev/null` throws the message
 * away, and `set -e` then kills the launcher before Electron is ever exec'd. The
 * snap exits 1 with completely empty output — exactly what #2946 reports.
 *
 * `$b` is computed with `realpath --relative-to="$HOME"` against the snap's
 * private `$HOME`, so an XDG user directory living outside it (for example on
 * `/mnt`) yields `../../../..`, and `"$HOME/$b"` resolves straight back out to
 * the user's *real* directory. The `rmdir` plus the `ln -s` that follows it can
 * therefore replace a real user directory with a self-referential symlink, so
 * this patch also skips entries whose relative path escapes `$HOME`.
 *
 * Why patch at build time rather than fixing it upstream or in config:
 *
 *   - `desktop-common.sh` is not ours. For arm64 it comes from
 *     `app-builder-lib/templates/snap/`; for x64 it comes from the
 *     `snap-template-electron-4.0-*` tarball that electron-builder downloads
 *     from electron-builder-binaries. That tarball is a frozen 2019 release, so
 *     an electron-builder upgrade would not fix x64 anyway.
 *   - electron-builder is deliberately frozen at 26.15.7 (see
 *     `.github/dependabot.yml`, refs #2756, #2684, #2905) and the core24
 *     migration that would take a different code path was reverted in #2906.
 *   - `useTemplateApp: false` does not avoid the chain — `buildWithoutTemplate`
 *     copies the same three scripts into the snap.
 *
 * Because electron-builder is pinned, the internal module paths and template
 * checksums referenced below are stable; `assertTemplateStillMatches` fails the
 * build loudly if they ever stop matching.
 */

const { readFile, writeFile, chmod } = require("node:fs/promises");
const path = require("node:path");
const { Arch } = require("builder-util");

const APP_BUILDER_LIB_DIR = path.dirname(require.resolve("app-builder-lib/package.json"));
const CORE_LEGACY_PATH = path.join(APP_BUILDER_LIB_DIR, "out", "targets", "snap", "coreLegacy.js");
const BUNDLED_TEMPLATE_SCRIPT = path.join(APP_BUILDER_LIB_DIR, "templates", "snap", "desktop-common.sh");

// Mirrors SNAP_TEMPLATES in coreLegacy.js. Kept in step by assertTemplateStillMatches().
const SNAP_TEMPLATES = {
  amd64: {
    releaseName: "snap-template-4.0-2",
    filenameWithExt: "snap-template-electron-4.0-2-amd64.tar.7z",
    checksum: "5e3ab4e09364ac06f0072b1c2dab9138318c933f6b2c7374f893b5ec44d19e6f",
  },
};

// Only x64 takes the downloaded-template path (coreLegacy.js:59); armv7l did
// too until Electron 44 dropped 32-bit builds (#2994). arm64 is packed by
// snapcraft from the scripts bundled in app-builder-lib.
const TEMPLATE_ARCH_BY_ARCH = new Map([[Arch.x64, "amd64"]]);

const PATCH_MARKER = "teams-for-linux #2946";
const FONTCONFIG_PATCH_MARKER = "teams-for-linux #3092";

// The exact block shipped by both copies of desktop-common.sh. Matched literally
// (indexOf, no regex) so a changed upstream script fails loudly instead of
// being silently half-patched.
const ORIGINAL_BLOCK = [
  '    b="$(realpath "${XDG_SPECIAL_DIRS_PATHS[$i]}" --relative-to="$HOME")"',
  '    if [ -e "$REALHOME/$b" ]; then',
  '      if [ -d "$HOME/$b" ]; then',
  '        rmdir "$HOME/$b" 2> /dev/null',
  "      fi",
].join("\n");

const PATCHED_BLOCK = [
  '    b="$(realpath "${XDG_SPECIAL_DIRS_PATHS[$i]}" --relative-to="$HOME")"',
  "    # " + PATCH_MARKER + ': $b is relative to the snap private $HOME, so an XDG',
  '    # user dir outside it yields "../..", and "$HOME/$b" escapes back to the real',
  "    # directory the rmdir/ln pair below would then clobber. Skip those entries.",
  '    if [ "$b" = ".." ] || [ "${b#../}" != "$b" ]; then',
  "      continue",
  "    fi",
  '    if [ -e "$REALHOME/$b" ]; then',
  '      if [ -d "$HOME/$b" ]; then',
  "        # " + PATCH_MARKER + ": rmdir exits 1 on a non-empty directory and this",
  "        # script runs under `set -e`, which killed the launcher before Electron",
  "        # was exec'd — the snap exited 1 with no output at all.",
  '        rmdir "$HOME/$b" 2> /dev/null || true',
  "      fi",
].join("\n");

// #3092: Isolates snap font cache from host fontconfig cache to prevent
// incompatible binary cache collisions (e.g. cache-11/12 on host vs cache-7 in snap).
const ORIGINAL_FONTCONFIG_BLOCK = [
  '  echo \'  <include ignore_missing="yes">conf.d</include>\'',
  '  # We need to include this default cachedir first so that caching',
  '  # works: without it, fontconfig will try to write to the real user home',
  '  # cachedir and be blocked by AppArmor.',
  "  echo '  <cachedir prefix=\"xdg\">fontconfig</cachedir>'",
  '  if [ -d "$REALHOME/.cache/fontconfig" ]; then',
  '    echo "  <cachedir>$REALHOME/.cache/fontconfig</cachedir>"',
  '  fi',
  '  echo "</fontconfig>"',
  "}",
  "",
  'if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then',
  '  rm -rf "$XDG_DATA_HOME"/{fontconfig,fonts,fonts-*,themes,.themes}',
].join("\n");

const PATCHED_FONTCONFIG_BLOCK = [
  '  echo \'  <include ignore_missing="yes">conf.d</include>\'',
  '  # We need to include this default cachedir first so that caching',
  '  # works: without it, fontconfig will try to write to the real user home',
  '  # cachedir and be blocked by AppArmor.',
  "  echo '  <cachedir prefix=\"xdg\">fontconfig</cachedir>'",
  "  # " + FONTCONFIG_PATCH_MARKER + ": do not reference $REALHOME/.cache/fontconfig.",
  "  # Host fontconfig caches (e.g. cache-11/12 on modern distros) are incompatible",
  "  # with the runtime's fontconfig (cache-7) and cause characters to render as squares.",
  '  echo "</fontconfig>"',
  "}",
  "",
  'if [ "$SNAP_DESKTOP_COMPONENTS_NEED_UPDATE" = "true" ]; then',
  '  rm -rf "$XDG_DATA_HOME"/{fontconfig,fonts,fonts-*,themes,.themes}',
  "  # " + FONTCONFIG_PATCH_MARKER + ": clear stale snap font cache on revision update",
  '  rm -rf "$XDG_CACHE_HOME/fontconfig"',
].join("\n");

/**
 * Rewrites desktop-common.sh to fix both #2946 and #3092. Idempotent:
 * sections already carrying their respective marker are left alone.
 * Throws if an expected block is absent, so upstream changes fail loudly.
 */
async function patchScript(scriptPath) {
  let source;
  try {
    source = await readFile(scriptPath, "utf8");
  } catch (error) {
    throw new Error(`snap launcher patch: cannot read ${scriptPath}: ${error.message}`, { cause: error });
  }

  let modified = false;

  if (!source.includes(PATCH_MARKER)) {
    const at = source.indexOf(ORIGINAL_BLOCK);
    if (at < 0) {
      throw new Error(
        `#2946 snap launcher patch: the expected rmdir block was not found in ${scriptPath}. ` +
          "electron-builder's snap launcher changed — re-check the workaround before building.",
      );
    }
    if (source.includes(ORIGINAL_BLOCK, at + ORIGINAL_BLOCK.length)) {
      throw new Error(`#2946 snap launcher patch: the rmdir block appears more than once in ${scriptPath}.`);
    }

    source = source.slice(0, at) + PATCHED_BLOCK + source.slice(at + ORIGINAL_BLOCK.length);
    modified = true;
  }

  if (!source.includes(FONTCONFIG_PATCH_MARKER)) {
    const at = source.indexOf(ORIGINAL_FONTCONFIG_BLOCK);
    if (at < 0) {
      throw new Error(
        `#3092 snap launcher patch: the expected fontconfig block was not found in ${scriptPath}. ` +
          "electron-builder's snap launcher changed — re-check the workaround before building.",
      );
    }
    if (source.includes(ORIGINAL_FONTCONFIG_BLOCK, at + ORIGINAL_FONTCONFIG_BLOCK.length)) {
      throw new Error(`#3092 snap launcher patch: the fontconfig block appears more than once in ${scriptPath}.`);
    }

    source = source.slice(0, at) + PATCHED_FONTCONFIG_BLOCK + source.slice(at + ORIGINAL_FONTCONFIG_BLOCK.length);
    modified = true;
  }

  if (modified) {
    await writeFile(scriptPath, source, "utf8");
    await chmod(scriptPath, 0o755);
    console.log(`   patched: ${scriptPath}`);
    return true;
  }

  console.log(`   already patched: ${scriptPath}`);
  return false;
}

/**
 * Fails the build if coreLegacy.js no longer declares the template release and
 * checksum this script hard-codes, which would mean we are patching a cache
 * directory electron-builder does not use.
 */
async function assertTemplateStillMatches(template) {
  const source = await readFile(CORE_LEGACY_PATH, "utf8");
  for (const literal of [template.releaseName, template.filenameWithExt, template.checksum]) {
    if (!source.includes(literal)) {
      throw new Error(
        `#2946 snap launcher patch: "${literal}" is no longer declared in ${CORE_LEGACY_PATH}. ` +
          "The snap template moved — update SNAP_TEMPLATES in this script.",
      );
    }
  }
}

/**
 * Materialises the snap template into electron-builder's own cache (the same
 * call coreLegacy.js makes) and patches the desktop-common.sh inside it. The
 * cache is validated on file count only, so the patched copy is reused by the
 * build that follows.
 */
async function patchDownloadedTemplate(templateArch) {
  const template = SNAP_TEMPLATES[templateArch];
  await assertTemplateStillMatches(template);

  // Required lazily so unit tests can exercise patchScript() without pulling in
  // electron-builder's internals.
  const { downloadBuilderToolset } = require("app-builder-lib/out/util/electronGet");
  const templateDir = await downloadBuilderToolset({
    releaseName: template.releaseName,
    filenameWithExt: template.filenameWithExt,
    checksums: { [template.filenameWithExt]: template.checksum },
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  });

  await patchScript(path.join(templateDir, "desktop-common.sh"));
}

/**
 * Patches every desktop-common.sh the snap build for `arch` can consume.
 *
 * @param {number} arch electron-builder Arch enum value.
 */
async function patchSnapDesktopLauncher(arch) {
  console.log("🔄 Patching snap desktop launcher (#2946, #3092)...");

  // Used by the no-template path (arm64, and any build with custom packages).
  await patchScript(BUNDLED_TEMPLATE_SCRIPT);

  // Used by the template path (x64).
  if (TEMPLATE_ARCH_BY_ARCH.has(arch)) {
    await patchDownloadedTemplate(TEMPLATE_ARCH_BY_ARCH.get(arch));
  }

  console.log("✅ Snap desktop launcher patched");
}

module.exports = {
  patchSnapDesktopLauncher,
  patchScript,
  BUNDLED_TEMPLATE_SCRIPT,
  ORIGINAL_BLOCK,
  PATCHED_BLOCK,
  PATCH_MARKER,
  ORIGINAL_FONTCONFIG_BLOCK,
  PATCHED_FONTCONFIG_BLOCK,
  FONTCONFIG_PATCH_MARKER,
};
