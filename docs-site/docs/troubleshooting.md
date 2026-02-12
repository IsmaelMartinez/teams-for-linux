# Troubleshooting Guide

This guide provides solutions to common problems encountered with Teams for Linux, organized by category for quick reference.

:::tip
For configuration options, see [Configuration](configuration.md). For development information, see the IPC API documentation *(coming soon)*.
:::

## Quick Reference

- **Cache Issues**: Clear cache directories (see [Cache Management](configuration.md#cache-management))
- **Login Problems**: Clear stored data and cache
- **Notification Issues**: Check `notificationMethod` in config
- **Audio/Video**: Verify device selection in Teams settings
- **Installation**: Use clean install and clear previous data

---

## Common Issues and Solutions

### Installation and Updates

#### Issue: Application fails to launch after update

**Description:** Users report that the application does not start or crashes immediately after an update.

**Potential Causes:**
*   Corrupted installation files.
*   Conflicting cached data from previous versions.
*   Incomplete update process.

**Solutions/Workarounds:**

1.  **Clear Application Cache:**
    *   Navigate to `~/.config/teams-for-linux/` (Linux) or `%APPDATA%\teams-for-linux\` (Windows).
    *   Delete the `Cache` and `Code Cache` directories.
    *   Restart the application.

2.  **Reinstall the Application:**
    *   Completely uninstall the current version.
    *   Download the latest installer from the official GitHub releases page.
    *   Perform a clean installation.

**Related GitHub Issues:** [Link to relevant issues, e.g., #123, #456]

#### Issue: No History after Electron version update

**Description:** When updating the Electron version, the channel history may sometimes disappear. This issue is typically related to a change in the user agent.

**Potential Causes:**
*   Change in user agent string with new Electron version.
*   Incompatible cached data from previous versions.

**Solutions/Workarounds:**

1.  **Remove Stored Data:** Removing the stored data in the configuration directory usually resolves the problem.

    **Configuration Folder Locations:**

    | Type of install | Location | Clean-up command |
    | :----------------------: | :---------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: |
    | Vanilla install | `~/.config/teams-for-linux` | `rm -rf ~/.config/teams-for-linux` |
    | snap | `~/snap/teams-for-linux/current/.config/teams-for-linux/` | `rm -rf ~/snap/teams-for-linux/current/.config/teams-for-linux/` |
    | --user installed flatpak | `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux` | `rm -rf ~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux` |
    | From source | `~/.config/Electron/` | `rm -rf ~/.config/Electron/` |


#### Issue: No Apple Silicon Mac build

**Description:** Only Intel Mac builds are provided in GitHub releases, and Apple Silicon Macs cannot run unsigned code without an Apple Developer account.

**Potential Causes:**
*   Apple's code signing requirements for ARM-based Macs.
*   Cost associated with Apple Developer Program for distributing signed binaries.

**Solutions/Workarounds:**

1.  **Use Intel Build:** The Intel build works on Apple Silicon via emulation (albeit slowly).

2.  **Build Your Own:** You can build an Apple Silicon version from source, signing it with your own developer keys. This process is free, but the keys will only work on your Mac.

    **Steps to Build Your Own:**
    1.  Download and open Xcode from the App Store.
    2.  In Xcode, go to Xcode → Settings → Accounts and add your account.
    3.  Under your account, click Manage Certificates and add an Apple Development certificate.
    4.  Create a dummy project in Xcode (any project will work) to ensure the certificate is added to your Keychain as trusted.
    5.  In the repository, run:
        ```bash
        npm ci
        npm run dist:mac:arm64
        ```
        You should see a signing step in the output (ignore the "skipped macOS notarization" warning).
        The app will be built in the `dist/mac-arm64/` folder. Copy it to your Applications folder.

**Related GitHub Issues:** [Issue #1225](https://github.com/IsmaelMartinez/teams-for-linux/issues/1225)

---

### User Interface (UI) and User Experience (UX)

#### Issue: No rendering fonts correctly

**Description:** Some users have reported issues with fonts not rendering correctly, appearing as squares.

**Potential Causes:**
*   Corrupted fontconfig cache.

**Solutions/Workarounds:**

1.  **Clear Fontconfig Cache:**
    ```bash
    sudo rm /var/cache/fontconfig/*
    rm ~/.cache/fontconfig/*
    fc-cache -r
    ```
    This issue is related to the fontconfig cache. The above commands will clear it.

**Related GitHub Issues:** [Issue #357](https://github.com/IsmaelMartinez/teams-for-linux/issues/357)

---

#### Issue: Window decorations stuck in dark mode on GNOME systems

**Description:** On GNOME desktop environments, Teams for Linux window decorations (title bar, borders) remain in dark mode even when the system theme is set to light mode.

**Potential Causes:**
* Earlier versions of Electron had issues with properly responding to GNOME theme changes
* System theme detection not working correctly with certain GNOME versions

**Solutions/Workarounds:**

1. **Update to Latest Version:**
   * Ensure you're using Teams for Linux v2.2.1 or later, which includes Electron 37.2.6 with upstream fixes for GNOME theme handling
   
2. **Temporary Workaround (for older versions):**
   ```bash
   xprop -f _GTK_THEME_VARIANT 8u -set _GTK_THEME_VARIANT "light"
   ```
   Run this command while Teams for Linux is running to force light window decorations

3. **System Theme Settings:**
   * Ensure your GNOME theme preference is properly set:
   ```bash
   gsettings set org.gnome.desktop.interface color-scheme prefer-light
   ```

**Status:** Fixed in Teams for Linux v2.2.1+ (Electron 37.2.6)

**Related GitHub Issues:** [Issue #1755](https://github.com/IsmaelMartinez/teams-for-linux/issues/1755)

---

### Audio and Video Issues

#### Issue: Microphone not working during calls

**Description:** Participants cannot hear the user during a call, or the microphone input is very low.

**Potential Causes:**
*   Incorrect microphone selected in Teams settings.
*   System-level microphone permissions or volume settings.
*   PulseAudio/PipeWire configuration issues (Linux).

**Solutions/Workarounds:**

1.  **Check Teams Settings:**
    *   Go to Teams Settings -> Devices.
    *   Ensure the correct microphone is selected under "Microphone".
    *   Test the microphone using the "Make a test call" feature.

2.  **Verify System Audio Settings:**
    *   Open your operating system's sound settings.
    *   Ensure the microphone is enabled, not muted, and its volume is adequately set.
    *   Check application-specific permissions for Teams to access the microphone.

3.  **Restart PulseAudio (Linux):**
    *   Open a terminal and run: `pulseaudio -k && pulseaudio --start`
    *   Restart Teams for Linux.

**Related GitHub Issues:** [Link to relevant issues, e.g., #789, #1011]

---

### Login and Authentication

#### Issue: Unable to log in, stuck on a blank screen after entering credentials

**Description:** After entering login credentials, the application displays a blank white or black screen and does not proceed to the main interface.

**Potential Causes:**
*   Authentication token issues.
*   Proxy or network configuration problems.
*   Browser cache issues within the Electron app.

**Solutions/Workarounds:**

1.  **Clear Teams Cache and Data:**
    *   Close Teams for Linux completely.
    *   Navigate to `~/.config/teams-for-linux/` (Linux) or `%APPDATA%\teams-for-linux\` (Windows).
    *   Delete the entire `Cache`, `Code Cache`, and `Local Storage` directories.
    *   Restart the application and attempt to log in again.

2.  **Check Network and Proxy Settings:**
    *   Ensure your internet connection is stable.
    *   If you are behind a corporate proxy, ensure it is correctly configured in your system settings and that Teams for Linux can access the internet through it.

**Related GitHub Issues:** [Link to relevant issues, e.g., #1212, #1314]

#### Issue: Oauth Services require internal Electron window

**Description:** Some OAuth services (for example, GitHub) require that authentication windows open inside Electron, but by default Teams for Linux opens links in an external browser.

**Potential Causes:**
*   Default browser behavior for opening external links.
*   Security restrictions of OAuth providers.

**Solutions/Workarounds:**

1.  **Use Ctrl+Click:** If you need to open a link within an Electron window, use the `Ctrl+Click` combination.

#### Issue: Blank Page at Login

**Description:** Some users report a blank page at login (titled "Microsoft Teams - initializing").

**Potential Causes:**
*   Corrupted application cache.
*   Issues with rendering the login page.

**Solutions/Workarounds:**

1.  **Refresh the Window:**
    *   Right-click the Microsoft Teams tray icon and select Refresh (or use Ctrl+R).

2.  **Clear Application Cache:**
    *   Close the application and delete the cache folder:
        *   For a Vanilla install: `~/.config/teams-for-linux/Partitions/teams-4-linux/Application Cache`
        *   For Snap: `~/snap/teams-for-linux/current/.config/teams-for-linux/Partitions/teams-4-linux/Application Cache`
        *   For Flatpak: `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/Partitions/teams-4-linux/Application Cache/`
    If the blank page returns after reloading or closing the app, repeat the cache deletion step.

**Related GitHub Issues:** [Issue #171](https://github.com/IsmaelMartinez/teams-for-linux/issues/171)

---

### Notifications

#### Issue: No Desktop Notifications

**Description:** Some Linux notification daemons do not fully support the implementation used by Microsoft in their web version, which may result in certain notifications not being shown.

**Potential Causes:**
*   Incompatibility between Linux notification systems and Teams' notification implementation.
*   Incorrect notification settings.

**Solutions/Workarounds:**

1.  **Check Configuration:** Please refer to the `notificationMethod`, and other notification settings, in the [Configuration Documentation](configuration.md) for more information.

---

### Wayland / Display Issues

:::info Default Behavior
Since v2.8.0, Teams for Linux forces X11 mode (`--ozone-platform=x11`) by default on all Linux packaging formats. This avoids widespread regressions introduced in Electron 38+ when running as a native Wayland client. See the [Wayland/X11 Investigation](development/research/wayland-x11-ozone-platform-investigation.md) for full details.
:::

#### Issue: Blank or black window on Wayland

**Description:** The application window appears blank, black, or white when running on a Wayland session. This is caused by Electron 38+ defaulting to native Wayland mode, which has known regressions.

**Solutions/Workarounds:**

1. **Upgrade to v2.8.0+** — X11 is now forced by default, which resolves this for most users.
2. **For older versions:** Launch with `--ozone-platform=x11`:
    ```bash
    teams-for-linux --ozone-platform=x11
    ```

**Related GitHub Issues:** [#1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604), [#1494](https://github.com/IsmaelMartinez/teams-for-linux/issues/1494), [#519](https://github.com/IsmaelMartinez/teams-for-linux/issues/519), [#504](https://github.com/IsmaelMartinez/teams-for-linux/issues/504)

#### Issue: Maximized window has gaps or resizes on focus loss

**Description:** Since v2.7.0, maximizing the window doesn't fill the screen completely, leaving gaps. The window may also shrink when it loses focus.

**Solutions/Workarounds:**

1. **Upgrade to v2.8.0+** — Forcing X11 mode resolves Wayland window management regressions.

**Related GitHub Issues:** [#2094](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094)

#### Issue: Blurry UI or fonts with fractional scaling on Wayland

**Description:** Text and UI elements appear blurry when using fractional display scaling (e.g., 125%) on Wayland.

**Potential Causes:**
* X11 mode (the new default) does not handle Wayland fractional scaling natively.

**Solutions/Workarounds:**

1. **Override to native Wayland mode** (if you don't experience other Wayland bugs):
    ```bash
    teams-for-linux --ozone-platform=wayland
    ```
2. **Edit your `.desktop` file** to make the override permanent — replace `--ozone-platform=x11` with `--ozone-platform=wayland` in the `Exec=` line.

**Related GitHub Issues:** [#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787)

:::note Important
The `electronCLIFlags` config option (`config.json`) **cannot** override `--ozone-platform` because the flag must be set before the Electron process starts, and config is loaded after. Use command-line arguments or `.desktop` file edits instead.
:::

---

### Other

#### Issue: Spellchecker Not Working

**Description:** The bundled `node_spellchecker` only includes the `en_US` dictionary.

**Potential Causes:**
*   Limited dictionary support in the default spellchecker.

**Solutions/Workarounds:**

1.  **Enable Local Dictionaries:** Enable the use of local dictionaries by installing Hunspell along with your locale's dictionary. See the instructions at [Atom's spell-check README](https://github.com/atom/spell-check#debian-ubuntu-and-mint).

**Related GitHub Issues:** [Issue #28](https://github.com/IsmaelMartinez/teams-for-linux/issues/28), [Issue #154](https://github.com/IsmaelMartinez/teams-for-linux/issues/154)