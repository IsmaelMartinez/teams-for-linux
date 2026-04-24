# Troubleshooting Guide

This guide provides solutions to common problems encountered with Teams for Linux, organized by category for quick reference.

:::tip
For configuration options, see [Configuration](configuration.md). For development information, see the [IPC API documentation](development/ipc-api.md).
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

#### Issue: Third-Party SSO Login Fails (e.g. Symantec VIP)

**Description:** Users with third-party SSO providers like Symantec VIP see a broken or blank login page. Console logs may show `EvalError` or Content Security Policy violations referencing `strict-dynamic` or `nonce-` directives.

**Cause:** With `contextIsolation` disabled (required for Teams DOM access), Electron erroneously enforces report-only CSP headers as blocking policies.

**Solutions/Workarounds:**

Since v2.7.13, report-only CSP headers are automatically stripped for all non-Teams domains. No configuration is needed. If you are on an older version, upgrade to v2.7.13 or later to resolve this issue.

**Related GitHub Issues:** [Issue #2326](https://github.com/IsmaelMartinez/teams-for-linux/issues/2326)

#### Issue: Security Key (FIDO2 / WebAuthn) sign-in fails on Linux

**Description:** When signing in to Teams with a hardware security key (YubiKey, SoloKeys, Nitrokey, Feitian, etc.) on Linux, the login page spins indefinitely, shows an error, or no PIN dialog appears. macOS and Windows are unaffected.

**Cause:** Electron and Chromium on Linux do not ship a native FIDO2 authenticator backend (tracked upstream in [electron/electron#24573](https://github.com/electron/electron/issues/24573)). Teams for Linux ships an opt-in beta that routes `navigator.credentials` through the `fido2-tools` command-line suite, which talks to the security key over `/dev/hidraw*`.

**Solutions/Workarounds:**

1. Install `fido2-tools` on your system:
    - Debian / Ubuntu: `sudo apt install fido2-tools`
    - Fedora: `sudo dnf install fido2-tools`
    - Arch: `sudo pacman -S libfido2`

2. Enable the beta feature in `~/.config/teams-for-linux/config.json`:

    ```json
    {
      "auth": {
        "webauthn": {
          "enabled": true
        }
      }
    }
    ```

3. Plug your key in **before** triggering sign-in. The v1 implementation uses the first connected FIDO2 device. If you see a "No FIDO2 hardware device found" error, the key was not detected.

4. Verify the key is visible to libfido2 from a terminal: `fido2-token -L`. If this says "permission denied" on `/dev/hidraw*`, your user is not in the correct group. libfido2 typically ships a udev rule; if it did not install or is missing, add your user to the group your distribution uses for HID access (often `plugdev` on Debian/Ubuntu, or install `libfido2-udev` if your package manager has it). Replug the key after fixing group membership.

5. If the PIN dialog appears but sign-in still fails, enable debug logging and capture a fresh attempt:

    ```json
    {
      "auth": {
        "webauthn": {
          "enabled": true,
          "debug": true
        }
      },
      "logConfig": {
        "transports": {
          "file": { "level": "debug" }
        }
      }
    }
    ```

    Then tail the log during a sign-in attempt and attach the matching lines to the feedback thread:

    ```sh
    tail -F ~/.config/teams-for-linux/logs/main.log | grep -i webauthn
    ```

    Logs are scrubbed of credential IDs, challenges, user handles, PINs, and raw origins before writing. Origins appear as one of `login.microsoftonline.com | login.microsoft.com | login.live.com | other` and errors as coarse buckets (`NO_CREDENTIALS | BAD_PIN | TIMEOUT | CANCELLED | NOT_ALLOWED | SECURITY | INVALID | OTHER`).

**Beta notes:** This feature is opt-in while hardware coverage is still being validated. The single-device restriction, assertion echo-offset heuristic, and PIN-prompt stderr detection are all areas under active validation. Please report hardware combinations (key model, Linux distribution, libfido2 version) that work or fail on the umbrella issue so we can plan the GA rollout.

**Related GitHub Issues:** [Issue #802](https://github.com/IsmaelMartinez/teams-for-linux/issues/802), [PR #2357](https://github.com/IsmaelMartinez/teams-for-linux/pull/2357), [ADR 021](./development/adr/021-webauthn-fido2-linux.md).

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
Teams for Linux launches with `--ozone-platform=auto` by default on all Linux packaging formats, letting Chromium pick the best backend for your session (Wayland on a Wayland session, X11 otherwise). If you hit Wayland-specific regressions, you can override this on the command line or in your `.desktop` file with `--ozone-platform=x11`.
:::

#### Issue: Blank or black window on Wayland

**Description:** The application window appears blank, black, or white when running on a Wayland session. This is caused by Electron 38+ regressions in native Wayland mode.

**Solutions/Workarounds:**

1. **Force X11 mode** by launching with `--ozone-platform=x11`:
    ```bash
    teams-for-linux --ozone-platform=x11
    ```
2. **Edit your `.desktop` file** to make the override permanent — replace `--ozone-platform=auto` with `--ozone-platform=x11` in the `Exec=` line.

**Related GitHub Issues:** [#1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604), [#1494](https://github.com/IsmaelMartinez/teams-for-linux/issues/1494), [#519](https://github.com/IsmaelMartinez/teams-for-linux/issues/519), [#504](https://github.com/IsmaelMartinez/teams-for-linux/issues/504)

#### Issue: Maximized window has gaps or resizes on focus loss

**Description:** Since v2.7.0, maximizing the window doesn't fill the screen completely, leaving gaps. The window may also shrink when it loses focus.

**Solutions/Workarounds:**

1. **Force X11 mode** with `--ozone-platform=x11` to avoid Wayland window management regressions.

**Related GitHub Issues:** [#2094](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094)

#### Issue: Blurry UI or fonts with fractional scaling on Wayland

**Description:** Text and UI elements appear blurry when using fractional display scaling (e.g., 125%) on Wayland while running under XWayland (X11 mode).

**Potential Causes:**
* X11 mode does not handle Wayland fractional scaling natively.

**Solutions/Workarounds:**

1. **Override to native Wayland mode** (if you don't experience other Wayland bugs):
    ```bash
    teams-for-linux --ozone-platform=wayland
    ```
2. **Edit your `.desktop` file** to make the override permanent — replace `--ozone-platform=auto` with `--ozone-platform=wayland` in the `Exec=` line.

**Related GitHub Issues:** [#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787)

#### Issue: Audio/video lag during calls on Wayland

**Description:** Calls exhibit audio or video lag on Wayland sessions. Teams for Linux auto-disables GPU composition on Wayland by default, forcing software encoding even on stacks that would otherwise handle hardware acceleration fine.

**Potential Causes:**
* Teams for Linux automatically disables GPU composition on Wayland sessions by default to ensure stability, which can result in software-based rendering and increased lag during calls.

**Solutions/Workarounds:**

1. **Re-enable GPU acceleration** by setting `disableGpu` to `false` in your `config.json` file (see the [Installation and Updates](#installation-and-updates) section for the configuration folder path corresponding to your installation method):
    ```json
    {
      "disableGpu": false
    }
    ```
2. **Verify hardware acceleration** is active via **Debug → Open GPU Info** from the application menu (or `chrome://gpu` via DevTools), confirming the video decode/encode entries are hardware-accelerated.

**Related GitHub Issues:** [#2410](https://github.com/IsmaelMartinez/teams-for-linux/issues/2410)

#### Issue: Screen share receive fails or video glitches under Electron 41 (X11)

**Description:** On X11 sessions, after upgrading to teams-for-linux 2.8.0 (which bumped Electron to 41), one-on-one incoming screen shares can fail to render or the shared video stays blank. The log typically contains `ERROR:gpu/command_buffer/service/shared_image/shared_image_manager.cc: SharedImageManager::ProduceSkia: Trying to Produce a Skia representation from a non-existent mailbox.` emitted by the GPU process during the call. The symptom did not reproduce on teams-for-linux 2.7.13 (Electron 39). Reports on #2459 cover NVIDIA proprietary, AMD Radeon 780M, and Intel integrated graphics, so this is not vendor-specific.

**Potential Causes:**
* Electron 41 ships a newer Chromium with updated GPU SharedImage handling that regressed across several driver stacks on X11. X11 sessions keep GPU acceleration on by default (unlike Wayland, which auto-disables), so the regression is hit unmodified.

**Solutions/Workarounds:**

1. **Disable GPU acceleration** by setting `disableGpu` to `true` in `~/.config/teams-for-linux/config.json`:
    ```json
    {
      "disableGpu": true
    }
    ```
2. **Alternatively**, launch with `--disable-gpu` on the command line, or add it to the `Exec=` line of a custom copy of the `.desktop` entry under `~/.local/share/applications/teams-for-linux.desktop`.

**Related GitHub Issues:** [#2459](https://github.com/IsmaelMartinez/teams-for-linux/issues/2459)

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