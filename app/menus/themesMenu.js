const { BUILTIN_THEMES } = require("../customCSS/themes");

module.exports = function buildThemesMenu(Menus) {
  const customThemes = Menus.configGroup.customThemes ?? [];
  const selection = Menus.configGroup.themeSelection ?? {
    cssName: Menus.configGroup.startupConfig.customCSSName ?? "",
    cssLocation: Menus.configGroup.startupConfig.customCSSLocation ?? "",
  };
  const available = [...BUILTIN_THEMES, ...customThemes];
  const knownSelection = available.some((theme) => theme.value === selection.cssName);
  const themeItem = (theme) => ({
    // Theme metadata is text, including literal ampersands, not a mnemonic.
    label: theme.name.replaceAll("&", "&&"),
    // Radio groups are independent in nested native menus and auto-check
    // their first item. Controlled checkboxes show one selection across groups.
    type: "checkbox",
    checked: selection.cssName === theme.value,
    click: () => Menus.selectTheme(theme.value),
  });
  return {
    label: "Theme",
    submenu: [
      {
        label: "Default",
        type: "checkbox",
        checked: selection.cssName ? !knownSelection : !selection.cssLocation,
        click: () => Menus.selectTheme(""),
      },
      { label: "Built-in", submenu: BUILTIN_THEMES.map(themeItem) },
      ...(customThemes.length
        ? [{ label: "Custom", submenu: customThemes.map(themeItem) }] : []),
      ...(selection.cssLocation ? [{
        label: "Custom CSS file",
        type: "checkbox",
        checked: !selection.cssName,
        click: () => Menus.selectTheme(null),
      }] : []),
      { type: "separator" },
      { label: "Open themes folder", click: () => Menus.openThemesFolder() },
    ],
  };
};
