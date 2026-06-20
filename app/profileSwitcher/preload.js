const { contextBridge, ipcRenderer } = require("electron");

// Bridge for the top switcher chrome strip. The strip renders our own
// vanilla HTML/CSS (no Teams DOM access), so it runs with contextIsolation +
// sandbox on and reaches main only through this narrow, allowlisted surface.
//
// list/getActive/switch reuse the existing ProfilesManager `profile-*`
// channels (already allowlisted). The `profile-switcher-*` channels are the
// strip-specific additions (open dialogs, grow/shrink for the dropdown, and
// the main→renderer state push).
contextBridge.exposeInMainWorld("profileSwitcherApi", {
  list: () => ipcRenderer.invoke("profile-list"),
  getActive: () => ipcRenderer.invoke("profile-get-active"),
  switch: (id) => ipcRenderer.invoke("profile-switch", id),
  openAddDialog: () => ipcRenderer.send("profile-switcher-open-add"),
  openManageDialog: () => ipcRenderer.send("profile-switcher-open-manage"),
  // Tell main to grow (open) or shrink (close) the strip so the dropdown is
  // not clipped by the collapsed 40px height. `invoke` (not `send`) so the
  // renderer can await the resize before revealing the dropdown.
  setExpanded: (expanded) =>
    ipcRenderer.invoke("profile-switcher-set-expanded", expanded),
  // Main pushes { profiles, activeId } on any add/update/switch/remove.
  onState: (callback) =>
    ipcRenderer.on("profile-switcher-state", (_event, state) =>
      callback(state)
    ),
});
