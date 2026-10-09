const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BUILTIN_THEMES, discoverThemes, resolveTheme } = require("../../app/customCSS/themes");

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tfl-themes-")));
  const configPath = path.join(directory, "config");
  const themesPath = path.join(configPath, "themes");
  fs.mkdirSync(themesPath, { recursive: true });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const warnings = [];
  t.mock.method(console, "warn", (message) => warnings.push(message));
  return { directory, configPath, themesPath, warnings };
}

function writeTheme(themesPath, folder, metadata = {}, css = true) {
  const directory = path.join(themesPath, folder);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "theme.json"), JSON.stringify({
    id: folder,
    name: `Theme ${folder}`,
    css: "theme.css",
    ...metadata,
  }));
  if (css) fs.writeFileSync(path.join(directory, "theme.css"), "body { color: white; }");
  return directory;
}

describe("custom theme discovery", () => {
  test("registers a valid theme and its small optional metadata", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    const directory = writeTheme(themesPath, "my-theme", {
      name: "My Theme", author: "Example", version: "1.0.0", description: "Dark CSS",
    });
    assert.deepEqual(discoverThemes(configPath), [{
      id: "my-theme", name: "My Theme", css: "theme.css",
      cssPath: path.join(directory, "theme.css"), value: "custom:my-theme",
      author: "Example", version: "1.0.0", description: "Dark CSS",
    }]);
    assert.deepEqual(warnings, []);
  });

  test("missing theme directory and unspecified config path are silent", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    fs.rmdirSync(themesPath);
    assert.deepEqual(discoverThemes(configPath), []);
    assert.deepEqual(discoverThemes(undefined), []);
    assert.deepEqual(warnings, []);
  });

  test("malformed metadata and missing CSS never stop valid theme discovery", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    const broken = writeTheme(themesPath, "broken");
    fs.writeFileSync(path.join(broken, "theme.json"), "{ invalid json");
    writeTheme(themesPath, "missing-css", {}, false);
    writeTheme(themesPath, "valid");
    assert.deepEqual(discoverThemes(configPath).map((theme) => theme.id), ["valid"]);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every((warning) => warning.startsWith("[customCSS]")));
  });

  test("rejects oversized sparse metadata before reading it and continues discovery", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    const oversized = writeTheme(themesPath, "oversized");
    const oversizedMetadata = path.join(oversized, "theme.json");
    fs.truncateSync(oversizedMetadata, 64 * 1024 + 1);
    writeTheme(themesPath, "valid");
    const originalRead = fs.readFileSync;
    t.mock.method(fs, "readFileSync", (file, ...args) => {
      assert.notEqual(file, oversizedMetadata, "Oversized metadata must not be read");
      return originalRead(file, ...args);
    });
    assert.deepEqual(discoverThemes(configPath).map((theme) => theme.id), ["valid"]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /oversized metadata/);
  });

  test("rejects invalid metadata types, missing fields and ambiguous IDs", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    const metadata = [null, [], {}, { id: "custom:bad", name: "Bad", css: "theme.css" },
      { id: "bad", name: "", css: "theme.css" },
      { id: "bad", name: "Bad", css: "theme.css", author: {} }];
    metadata.forEach((value, index) => {
      const directory = writeTheme(themesPath, `invalid-${index}`);
      fs.writeFileSync(path.join(directory, "theme.json"), JSON.stringify(value));
    });
    assert.deepEqual(discoverThemes(configPath), []);
    assert.equal(warnings.length, metadata.length);
  });

  test("only immediate directories are scanned and loose CSS is untouched", (t) => {
    const { configPath, themesPath } = fixture(t);
    writeTheme(themesPath, "valid");
    writeTheme(path.join(themesPath, "container"), "nested");
    fs.writeFileSync(path.join(themesPath, "custom-dark.css"), "body {}");
    assert.deepEqual(discoverThemes(configPath).map((theme) => theme.id), ["valid"]);
  });

  test("duplicate IDs use the first valid directory in deterministic order", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    writeTheme(themesPath, "z-last", { id: "same", name: "Last" });
    writeTheme(themesPath, "a-first", { id: "same", name: "First" });
    const themes = discoverThemes(configPath);
    assert.equal(themes.length, 1);
    assert.equal(themes[0].name, "First");
    assert.match(warnings[0], /duplicate or reserved/);
  });

  test("an invalid earlier theme does not reserve an ID used by a later valid theme", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    writeTheme(themesPath, "a-invalid", { id: "same" }, false);
    const directory = writeTheme(themesPath, "z-valid", { id: "same", name: "Valid" });
    const themes = discoverThemes(configPath);
    assert.equal(themes.length, 1);
    assert.equal(themes[0].name, "Valid");
    assert.equal(themes[0].cssPath, path.join(directory, "theme.css"));
    assert.deepEqual(warnings, ["[customCSS] Ignoring unreadable or malformed custom theme."]);
  });

  test("custom themes cannot replace any built-in theme", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    for (const builtin of BUILTIN_THEMES) writeTheme(themesPath, builtin.id);
    assert.deepEqual(discoverThemes(configPath), []);
    assert.equal(warnings.length, BUILTIN_THEMES.length);
    assert.ok(Object.isFrozen(BUILTIN_THEMES));
    assert.ok(BUILTIN_THEMES.every(Object.isFrozen));
  });

  test("rejects traversal, absolute paths, remote URLs and non-CSS files", (t) => {
    const { directory, configPath, themesPath, warnings } = fixture(t);
    const invalidPaths = ["../escape.css", "nested/../../escape.css", "..\\escape.css",
      "nested\\..\\..\\escape.css", "/tmp/theme.css", "C:\\theme.css",
      "C:theme.css", "\\\\server\\theme.css", "https://example.com/theme.css", "theme.js"];
    fs.writeFileSync(path.join(directory, "escape.css"), "body {}");
    invalidPaths.forEach((css, index) => writeTheme(themesPath, `unsafe-${index}`, { css }));
    assert.deepEqual(discoverThemes(configPath), []);
    assert.equal(warnings.length, invalidPaths.length);
  });

  test("supports nested CSS with either separator convention", (t) => {
    const { configPath, themesPath } = fixture(t);
    const directory = writeTheme(themesPath, "nested", { css: "styles\\theme.css" }, false);
    fs.mkdirSync(path.join(directory, "styles"));
    fs.writeFileSync(path.join(directory, "styles", "theme.css"), "body {}");
    assert.equal(discoverThemes(configPath)[0].cssPath, path.join(directory, "styles", "theme.css"));
  });

  test("rejects symlink escapes through theme directories, metadata and CSS", (t) => {
    const { directory, configPath, themesPath, warnings } = fixture(t);
    const outside = writeTheme(directory, "outside");
    fs.symlinkSync(outside, path.join(themesPath, "directory-link"), "dir");
    const metadata = writeTheme(themesPath, "metadata-link");
    fs.unlinkSync(path.join(metadata, "theme.json"));
    fs.symlinkSync(path.join(outside, "theme.json"), path.join(metadata, "theme.json"));
    const css = writeTheme(themesPath, "css-link");
    fs.unlinkSync(path.join(css, "theme.css"));
    fs.symlinkSync(path.join(outside, "theme.css"), path.join(css, "theme.css"));
    assert.deepEqual(discoverThemes(configPath), []);
    assert.equal(warnings.length, 3);
    assert.ok(warnings.every((warning) => !warning.includes(directory)));
  });

  test("rejects a themes root linked outside the configuration directory", (t) => {
    const { directory, configPath, themesPath, warnings } = fixture(t);
    const outside = path.join(directory, "outside");
    writeTheme(outside, "external");
    fs.rmdirSync(themesPath);
    fs.symlinkSync(outside, themesPath, "dir");
    assert.deepEqual(discoverThemes(configPath), []);
    assert.equal(warnings.length, 1);
  });

  test("accepts file symlinks whose targets remain inside the theme", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    const directory = writeTheme(themesPath, "contained");
    fs.renameSync(path.join(directory, "theme.json"), path.join(directory, "metadata.json"));
    fs.symlinkSync("metadata.json", path.join(directory, "theme.json"));
    fs.renameSync(path.join(directory, "theme.css"), path.join(directory, "actual.css"));
    fs.symlinkSync("actual.css", path.join(directory, "theme.css"));
    assert.equal(discoverThemes(configPath)[0].cssPath, path.join(directory, "actual.css"));
    assert.deepEqual(warnings, []);
  });
});

describe("theme selection compatibility", () => {
  test("every existing cssName resolves to its real packaged stylesheet", () => {
    assert.deepEqual(BUILTIN_THEMES.map((theme) => theme.id),
      ["compactDark", "compactLight", "tweaks", "condensedDark", "condensedLight"]);
    for (const builtin of BUILTIN_THEMES) {
      assert.equal(resolveTheme({ appearance: { cssName: builtin.id } }), builtin.cssPath);
      assert.equal(resolveTheme({ customCSSName: builtin.id }), builtin.cssPath);
      assert.ok(fs.statSync(builtin.cssPath).isFile());
    }
  });

  test("nested and legacy direct CSS locations work without discovery", () => {
    assert.equal(resolveTheme({ appearance: { cssLocation: "/custom/theme.css" } }), "/custom/theme.css");
    assert.equal(resolveTheme({ customCSSLocation: "/legacy/theme.css" }), "/legacy/theme.css");
    assert.equal(resolveTheme({ appearance: { cssName: "", cssLocation: "" } }), null);
  });

  test("projected legacy aliases win over defaulted nested appearance values", () => {
    assert.equal(resolveTheme({ customCSSName: "compactDark", appearance: { cssName: "" } }),
      BUILTIN_THEMES[0].cssPath);
    assert.equal(resolveTheme({ customCSSLocation: "/legacy/theme.css", appearance: { cssLocation: "" } }),
      "/legacy/theme.css");
  });

  test("selected custom themes preserve cssName precedence over direct CSS", (t) => {
    const { configPath, themesPath } = fixture(t);
    const directory = writeTheme(themesPath, "sample");
    assert.equal(resolveTheme({ appearance: {
      cssName: "custom:sample", cssLocation: "/other/theme.css",
    } }, configPath), path.join(directory, "theme.css"));
  });

  test("can resolve from a supplied startup registry without rediscovering", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    writeTheme(themesPath, "sample");
    const themes = discoverThemes(configPath);
    const config = { customCSSName: "custom:sample" };
    assert.equal(resolveTheme(config, undefined, themes), themes[0].cssPath);
    assert.deepEqual(warnings, []);
  });

  test("missing selected custom theme falls back without rewriting config or using cssLocation", (t) => {
    const { configPath, themesPath, warnings } = fixture(t);
    const directory = writeTheme(themesPath, "removed");
    const config = { appearance: { cssName: "custom:removed", cssLocation: "/old/theme.css" } };
    assert.equal(resolveTheme(config, configPath), path.join(directory, "theme.css"));
    fs.rmSync(directory, { recursive: true });
    assert.equal(resolveTheme(config, configPath), null);
    assert.equal(config.appearance.cssName, "custom:removed");
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Selected theme is unavailable/);
  });

  test("invalid selected names cannot escape packaged assets and warnings do not expose values", (t) => {
    const { configPath, warnings } = fixture(t);
    assert.equal(resolveTheme({ customCSSName: "../../private-user/theme" }, configPath), null);
    assert.equal(resolveTheme({ customCSSName: "custom:private-user-missing" }, configPath), null);
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every((warning) => !warning.includes("private-user")));
  });
});
