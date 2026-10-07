const fs = require("node:fs");
const path = require("node:path");

// Keep existing persisted names: only user themes need a namespace.
const BUILTIN_THEMES = Object.freeze([
  { id: "compactDark", name: "Compact Dark" },
  { id: "compactLight", name: "Compact Light" },
  { id: "tweaks", name: "Tweaks" },
  { id: "condensedDark", name: "Condensed Dark" },
  { id: "condensedLight", name: "Condensed Light" },
].map((theme) => Object.freeze({
  ...theme,
  value: theme.id,
  cssPath: path.join(__dirname, "..", "assets", "css", `${theme.id}.css`),
})));

const THEME_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const OPTIONAL_METADATA = ["author", "version", "description"];
const MAX_METADATA_BYTES = 64 * 1024;

function isContained(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative !== "" && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isValidMetadata(metadata) {
  return metadata !== null && typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    typeof metadata.id === "string" && THEME_ID.test(metadata.id) &&
    typeof metadata.name === "string" && metadata.name.trim() !== "" &&
    typeof metadata.css === "string" && metadata.css.trim() !== "" &&
    OPTIONAL_METADATA.every((key) =>
      !Object.hasOwn(metadata, key) || typeof metadata[key] === "string"
    );
}

function getRelativeCssPath(css) {
  // Apply both separator conventions on every platform. Windows drive-relative
  // paths (C:theme.css), UNC paths and URLs are also outside the local format.
  const portable = css.replaceAll("\\", "/");
  if (path.posix.isAbsolute(portable) || path.win32.isAbsolute(css) ||
      portable.includes(":") || portable.includes("\0") ||
      portable.split("/").includes("..") ||
      path.posix.extname(portable).toLowerCase() !== ".css") {
    return null;
  }
  return portable;
}

/** Discover immediate child theme directories without executing theme content. */
function discoverThemes(configPath) {
  if (typeof configPath !== "string" || configPath === "") return [];
  let themesRoot;
  let entries;
  try {
    const configRoot = fs.realpathSync(configPath);
    themesRoot = fs.realpathSync(path.join(configRoot, "themes"));
    if (!isContained(configRoot, themesRoot)) {
      console.warn("[customCSS] Ignoring themes directory outside configuration directory.");
      return [];
    }
    entries = fs.readdirSync(themesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .sort((a, b) => a.name < b.name ? -1 : Number(a.name > b.name));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("[customCSS] Cannot read custom themes directory; using available built-in themes.");
    }
    return [];
  }

  const themes = [];
  const ids = new Set(BUILTIN_THEMES.map((theme) => theme.id));
  for (const entry of entries) {
    try {
      const themeDirectory = fs.realpathSync(path.join(themesRoot, entry.name));
      if (!isContained(themesRoot, themeDirectory) ||
          !fs.statSync(themeDirectory).isDirectory()) {
        console.warn("[customCSS] Ignoring custom theme directory outside themes directory.");
        continue;
      }
      const metadataPath = fs.realpathSync(path.join(themeDirectory, "theme.json"));
      const metadataStat = fs.statSync(metadataPath);
      if (!isContained(themeDirectory, metadataPath) ||
          !metadataStat.isFile()) {
        console.warn("[customCSS] Ignoring custom theme with unsafe metadata file.");
        continue;
      }
      // Metadata is a small manifest. Reject oversized or sparse files before
      // synchronously reading them during startup.
      if (metadataStat.size > MAX_METADATA_BYTES) {
        console.warn("[customCSS] Ignoring custom theme with oversized metadata file.");
        continue;
      }
      const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
      if (!isValidMetadata(metadata)) {
        console.warn("[customCSS] Ignoring invalid custom theme metadata.");
        continue;
      }
      const relativeCss = getRelativeCssPath(metadata.css);
      if (relativeCss === null) {
        console.warn("[customCSS] Ignoring custom theme with unsafe CSS path.");
        continue;
      }
      const cssPath = fs.realpathSync(path.resolve(themeDirectory, relativeCss));
      if (!isContained(themeDirectory, cssPath) || !fs.statSync(cssPath).isFile()) {
        console.warn("[customCSS] Ignoring custom theme with unsafe CSS file.");
        continue;
      }
      if (ids.has(metadata.id)) {
        console.warn("[customCSS] Ignoring duplicate or reserved custom theme ID.");
        continue;
      }
      // The first valid directory in code-point order wins duplicate IDs.
      ids.add(metadata.id);
      const theme = {
        id: metadata.id,
        name: metadata.name.trim(),
        css: metadata.css,
        cssPath,
        value: `custom:${metadata.id}`,
      };
      for (const key of OPTIONAL_METADATA) {
        if (Object.hasOwn(metadata, key)) theme[key] = metadata[key];
      }
      themes.push(theme);
    } catch {
      // Do not log exception text or paths: both may contain user information.
      console.warn("[customCSS] Ignoring unreadable or malformed custom theme.");
    }
  }
  return themes;
}

/** Resolve a selected theme, retaining cssName precedence over cssLocation. */
function resolveTheme(config, configPath, customThemes) {
  // Runtime config projects nested names onto legacy aliases. Reading those
  // first preserves legacy-only configs despite appearance's nested defaults.
  const cssName = Object.hasOwn(config, "customCSSName")
    ? config.customCSSName : config.appearance?.cssName;
  if (cssName) {
    const builtin = BUILTIN_THEMES.find((theme) => theme.value === cssName);
    if (builtin) return builtin.cssPath;
    if (typeof cssName === "string" && cssName.startsWith("custom:")) {
      const custom = (customThemes ?? discoverThemes(configPath))
        .find((theme) => theme.value === cssName);
      if (custom) return custom.cssPath;
    }
    console.warn("[customCSS] Selected theme is unavailable; using the default theme.");
    return null;
  }
  const cssLocation = Object.hasOwn(config, "customCSSLocation")
    ? config.customCSSLocation : config.appearance?.cssLocation;
  return typeof cssLocation === "string" && cssLocation !== "" ? cssLocation : null;
}

module.exports = { BUILTIN_THEMES, discoverThemes, resolveTheme };
