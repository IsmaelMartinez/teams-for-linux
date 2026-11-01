# Troubleshooting Guide

This guide provides solutions to common problems encountered with Teams for Linux, organized by category for quick reference.

:::tip
For configuration options, see [Configuration](configuration.md). For development information, see the [IPC API documentation](development/ipc-api.md).
:::

## Quick Reference

- **Cache Issues**: Clear cache directories (see [Cache Management](configuration.md#cache-management))
- **Login Problems**: Clear stored data and cache
- **Notification Issues**: Check `notifications.method` in config
- **Audio/Video**: Verify device selection in Teams settings
- **Installation**: Use clean install and clear previous data

## Performance Tuning

When the app feels slow or heavy, seven configuration options are the first-line knobs to check. `performance.disableGpu` turns off GPU compositing and hardware acceleration, which helps on broken graphics drivers and hurts otherwise. `cacheManagement.maxCacheSizeMB` (default 600) and `cacheManagement.cacheCheckIntervalMs` (default one hour) govern automatic cache cleanup, while `performance.electronCLIFlags` passes arbitrary Chromium flags for tuning memory, GPU, or rendering behaviour. `idleDetection.timeout` and `idleDetection.checkInterval.detectIdle` control how often idle state is polled, and `wayland.xwaylandOptimizations` affects GPU behaviour under XWayland. See [Configuration](configuration.md) for details on each option.

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

#### Issue: Snap exits immediately with status 1 and no output

**Description:** `snap run teams-for-linux` returns exit code 1 with completely empty stdout and stderr. No window appears and nothing is written to the journal. Affects snap revisions from 2396 onwards on `core22` ([#2946](https://github.com/IsmaelMartinez/teams-for-linux/issues/2946)).

**Potential Causes:**
*   The snap launcher runs a desktop-integration script under `set -e` that calls `rmdir` on an XDG user directory. `rmdir` fails on a non-empty directory, its error is discarded, and the launcher aborts before Electron ever starts.
*   Triggered when `~/.config/user-dirs.locale` is missing, or when an XDG user directory (Documents, Downloads, and so on) points somewhere the snap cannot read, such as a path under `/mnt` that needs the `removable-media` interface.

**Solutions/Workarounds:**

1.  **Update the snap.** Revisions built after this issue was fixed launch normally: `sudo snap refresh teams-for-linux`.

2.  **If you cannot update yet**, either create the missing locale file with `touch ~/.config/user-dirs.locale`, connect the interface your XDG directories need with `sudo snap connect teams-for-linux:removable-media`, or roll back with `sudo snap revert teams-for-linux`.

#### Issue: Kernel log flood or kauditd suppression from AppArmor netlink denials

**Description:** System logs show millions of AppArmor audit denials (`apparmor="DENIED" operation="recvmsg" class="net" family="netlink" protocol=15 comm="ThreadPoolForeg"`), and kernel logs (`dmesg` or `journalctl -k`) report thousands of callbacks suppressed by `kauditd_printk_skb` ([#3096](https://github.com/IsmaelMartinez/teams-for-linux/issues/3096)).

**Potential Causes:**
* Chromium/Electron's background device discovery thread (`ThreadPoolForegroundWorker`) polls a kernel `NETLINK_KOBJECT_UEVENT` socket (`protocol=15`) to monitor device hotplugging (e.g. webcams, USB audio headsets).
* On modern Linux distributions (such as Ubuntu 24.04+ and 26.04+) with AppArmor 4.x, strict netlink socket mediation blocks this socket unless the snap has the `hardware-observe` interface connected. When denied, Chromium's event polling loop can rapidly spin on `recvmsg()`, generating hundreds of thousands of audit denial events per second.

**Solutions/Workarounds:**

1.  **Connect the `hardware-observe` interface:**
    ```bash
    sudo snap connect teams-for-linux:hardware-observe
    ```

2.  **Restart the application.** Once connected, the netlink socket read succeeds without AppArmor denials and the log flood stops completely.

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


#### Issue: macOS refuses to open the app ("unverified developer" or "damaged")

**Description:** Releases now ship both an Intel (`teams-for-linux-<version>.dmg`) and an Apple Silicon (`teams-for-linux-<version>-arm64.dmg`) build. Neither is notarized, so Gatekeeper blocks the first launch of a downloaded copy.

**Potential Causes:**
*   The project has no Apple Developer Program membership, so the builds carry only an ad-hoc signature. That satisfies Apple Silicon's requirement that every arm64 binary be signed, but not Gatekeeper's requirement that downloaded apps be notarized.
*   Downloads are tagged with the `com.apple.quarantine` attribute, which is what triggers the block.

**Solutions/Workarounds:**

1.  **Approve it once in System Settings:** Open the app, dismiss the warning, then go to System Settings → Privacy & Security and click **Open Anyway** next to the entry for `teams-for-linux`. Confirm on the second prompt. This is only needed once per installed version.

2.  **Clear the quarantine attribute:** If macOS reports the app as "damaged" instead of offering an **Open Anyway** button, remove the quarantine flag directly:

    ```bash
    xattr -dr com.apple.quarantine /Applications/teams-for-linux.app
    ```

3.  **Build and sign it yourself:** You can build from source and sign with your own developer keys. This is free, but the keys only work on your Mac.

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

        Use `npm run dist:mac:x64` for an Intel build. `npm run dist:mac` — the script CI uses — builds both architectures but forces an ad-hoc signature, so it ignores any certificate you have installed.

**Related GitHub Issues:** [Issue #1225](https://github.com/IsmaelMartinez/teams-for-linux/issues/1225)

---

### User Interface (UI) and User Experience (UX)

#### Issue: No rendering fonts correctly

**Description:** Some users have reported issues with fonts not rendering correctly, appearing as squares.

**Potential Causes:**
*   Corrupted fontconfig cache.

**Solutions/Workarounds:**

1.  **Clear Fontconfig Cache:** quit the app, run the commands below, then start it again.
    ```bash
    rm -rf ~/snap/teams-for-linux/common/.cache/fontconfig
    rm ~/.cache/fontconfig/*
    sudo rm /var/cache/fontconfig/*
    fc-cache -r
    ```
    The first line only applies to the snap, which keeps its own fontconfig cache under `~/snap/teams-for-linux/common/.cache`.

    :::note
    Versions with the build-time launcher patch (#3092) isolate the fontconfig cache automatically. The manual commands above serve as a workaround for older versions or prior to package update.
    :::

**Related GitHub Issues:** [Issue #357](https://github.com/IsmaelMartinez/teams-for-linux/issues/357), [#1105](https://github.com/IsmaelMartinez/teams-for-linux/issues/1105), [#1328](https://github.com/IsmaelMartinez/teams-for-linux/issues/1328), [#3092](https://github.com/IsmaelMartinez/teams-for-linux/issues/3092)

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

#### Issue: System tray icon missing on Ubuntu Unity

**Description:** On Ubuntu Unity the Teams for Linux system tray icon does not appear in the top panel. Recent Chromium and Electron dropped support for the legacy libappindicator library that Unity requires, and now expose the tray only through the newer KStatusNotifierItem protocol, so the icon never registers. This is an upstream Electron limitation rather than a Teams for Linux bug.

**Potential Causes:**
* Chromium/Electron no longer ship libappindicator support, exposing the tray only via KStatusNotifierItem
* Unity uses libappindicator and does not implement KStatusNotifierItem, so no icon appears

**Solutions/Workarounds:**

Unsetting the `XDG_CURRENT_DESKTOP` environment variable for the app restores the tray on Unity. Rather than editing the packaged `.desktop` file (overwritten on every upgrade), drop an override that shadows it and survives updates.

1. **Per-user override** (recommended for a single machine):
   ```bash
   mkdir -p ~/.local/share/applications
   cp /usr/share/applications/teams-for-linux.desktop ~/.local/share/applications/
   sed -i 's|^Exec=|Exec=env -u XDG_CURRENT_DESKTOP |' ~/.local/share/applications/teams-for-linux.desktop
   ```

2. **System-wide override** (for an OEM or fleet image, applies to all users):
   ```bash
   sudo mkdir -p /usr/local/share/applications
   sudo cp /usr/share/applications/teams-for-linux.desktop /usr/local/share/applications/
   sudo sed -i 's|^Exec=|Exec=env -u XDG_CURRENT_DESKTOP |' /usr/local/share/applications/teams-for-linux.desktop
   ```

Both locations sit ahead of `/usr/share/applications` in `XDG_DATA_DIRS`, so they shadow the packaged entry and are not touched by `apt upgrade`. The override keeps the rest of the `Exec=` line intact.

**Note:** `XDG_CURRENT_DESKTOP` also drives the xdg desktop portals (screen sharing, file pickers) and GTK theming, so only unset it where you actually need the tray. The icon may also come up generic rather than the purple Teams logo (see #888).

**Status:** Upstream Electron limitation ([electron/electron#38979](https://github.com/electron/electron/issues/38979)); no fix on the Teams for Linux side.

**Related GitHub Issues:** [Issue #2680](https://github.com/IsmaelMartinez/teams-for-linux/issues/2680), [Issue #888](https://github.com/IsmaelMartinez/teams-for-linux/issues/888)

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

#### Issue: Blank "Waiting for network" screen behind a TLS-inspecting proxy

**Description:** On a corporate network that intercepts TLS (a proxy re-signs every HTTPS
connection with an internal CA), the window stays on a blank screen titled "Waiting for
network" and never loads. Debug logs show repeated `net_error -202`
(`ERR_CERT_AUTHORITY_INVALID`) handshake failures, often alongside AIA fetch errors, ending
in `ERR_CONNECTION_CLOSED` for the main frame.

**Potential Causes:**
*   The corporate root CA is installed in the system store only. On Linux, Chromium and
    Electron read a per-user NSS database, not the system OpenSSL store, so
    `update-ca-certificates` does not reach the app on Debian and Ubuntu.
*   The proxy serves an incomplete chain and the intermediate is not trusted locally either.

**Solutions/Workarounds:**

1.  **Import the CA into the NSS database:** see
    [Certificate Management](certificate.md#linux-the-system-ca-store-is-not-enough) for the
    `certutil` steps, the correct database path, and the Snap and Flatpak locations.

2.  **On Fedora, RHEL and openSUSE:** `update-ca-trust` is sufficient, because those
    distributions route NSS trust through `p11-kit-trust`.

**Related GitHub Issues:** [Issue #2762](https://github.com/IsmaelMartinez/teams-for-linux/issues/2762)

---

#### Issue: Third-Party SSO Login Fails (e.g. Symantec VIP)

**Description:** Users with third-party SSO providers like Symantec VIP see a broken or blank login page. Console logs may show `EvalError` or Content Security Policy violations referencing `strict-dynamic` or `nonce-` directives.

**Cause:** With `contextIsolation` disabled (required for Teams DOM access), Electron erroneously enforces report-only CSP headers as blocking policies.

**Solutions/Workarounds:**

Since v2.7.13, report-only CSP headers are automatically stripped for all non-Teams domains. No configuration is needed. If you are on an older version, upgrade to v2.7.13 or later to resolve this issue.

**Related GitHub Issues:** [Issue #2326](https://github.com/IsmaelMartinez/teams-for-linux/issues/2326)

#### Issue: Sign-in stuck on "Face, fingerprint, PIN or security key"

**Description:** Microsoft's sign-in page stops on "Face, fingerprint, PIN or security key" and offers no other method until it times out, which can take up to ten minutes. This affects accounts with a passkey registered, including people who have no security key to hand or normally sign in with a password and Microsoft Authenticator.

**Cause:** Electron on Linux has no WebAuthn user interface (tracked upstream in [electron/electron#24573](https://github.com/electron/electron/issues/24573)). When Teams for Linux does not handle the request itself, Electron waits silently for the page's own timeout, with no dialog and no way to cancel. Microsoft's sign-in page has been seen asking for ten minutes. Phone and QR passkeys do not work either, because Electron never starts that flow on Linux.

**Solutions/Workarounds:**

1. Wait for the timeout, then choose another sign-in method.

2. To skip the wait, install `fido2-tools` and enable `auth.webauthn.enabled` as described in the next entry, then restart. Teams for Linux now answers the request itself: either its PIN dialog or its "Waiting for your security key" prompt appears, and you click Cancel, or the request fails at once because no key is connected. Either way Microsoft stops waiting and shows either its other sign-in methods or a "We couldn't sign you in" page, whose "Sign in another way" link leads to them (password plus Microsoft Authenticator, for example). The Flathub build bundles `fido2-tools`; the snap does not yet ([PR #3085](https://github.com/IsmaelMartinez/teams-for-linux/pull/3085)). On the snap, enabling the setting still ends the wait when the sign-in page is the top-level page, but not when it is embedded in a frame, so the first option may still be needed.

If you start Teams for Linux with `--user-data-dir`, put `config.json` in that directory, not in `~/.config/teams-for-linux`.

**Related GitHub Issues:** [Issue #2624](https://github.com/IsmaelMartinez/teams-for-linux/issues/2624), [Issue #3037](https://github.com/IsmaelMartinez/teams-for-linux/issues/3037), [Issue #2944](https://github.com/IsmaelMartinez/teams-for-linux/issues/2944).

#### Issue: Security Key (FIDO2 / WebAuthn) sign-in fails on Linux

**Description:** When signing in to Teams with a hardware security key (YubiKey, SoloKeys, Nitrokey, Feitian, etc.) on Linux, the login page spins indefinitely, shows an error, or no PIN dialog appears. macOS and Windows are unaffected.

**Cause:** Electron and Chromium on Linux do not ship a native FIDO2 authenticator backend (tracked upstream in [electron/electron#24573](https://github.com/electron/electron/issues/24573); as of Electron 44 there is still no PIN entry, no phone flow and no cancel prompt on Linux). Teams for Linux ships an opt-in beta that routes `navigator.credentials` through the `fido2-tools` command-line suite, which talks to the security key over `/dev/hidraw*`.

**Solutions/Workarounds:**

1. Install `fido2-tools` on your system (the official deb and rpm packages list it as a recommended dependency, so most installs already have it):
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

**Beta notes:** This feature is opt-in while hardware coverage is still being validated. The single-device restriction, assertion echo-offset heuristic, and PIN-prompt stderr detection are all areas under active validation. Starting the sign-in from the passkey button (without typing your email first) uses the key's resident credentials, which requires a key that supports CTAP 2.1 credential management; if the key holds credentials for more than one account on the site, that flow stops with an error, as an account picker is not implemented yet. Typing your email address first works in both cases. Please report hardware combinations (key model, Linux distribution, libfido2 version) that work or fail on the umbrella issue so we can plan the GA rollout.

**Related GitHub Issues:** [Issue #802](https://github.com/IsmaelMartinez/teams-for-linux/issues/802), [PR #2357](https://github.com/IsmaelMartinez/teams-for-linux/pull/2357), [ADR 021](./development/adr/021-webauthn-fido2-linux.md).

#### Issue: Google Sign-in shows "This browser or app may not be secure"

**Description:** When signing in with a Google account ("Sign in with Google"), Google's password page rejects the login with "This browser or app may not be secure". Microsoft work, school, and personal accounts are unaffected.

**Cause:** Google's sign-in flow inspects the browser user agent and blocks user agents it does not recognize as a trusted app or browser. Teams for Linux ships a Chrome user agent with the Electron token removed (Microsoft sign-in and calls misbehave when the Electron token is present), but Google's check also wants an application-identifier token in the string, which the default user agent does not carry.

**Solutions/Workarounds:**

Set a custom `platform.chromeUserAgent` in your `config.json` file (see the [Installation and Updates](#installation-and-updates) section for the configuration folder path corresponding to your installation method) so the user agent carries an application-identifier token, then restart the app. Take the default user agent from the [configuration reference](configuration.md) and insert a token such as `teams-for-linux/1.0` before the `Chrome/...` segment:

```json
{
  "platform": {
    "chromeUserAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) teams-for-linux/1.0 Chrome/<your-chrome-version> Safari/537.36"
  }
}
```

Replace `<your-chrome-version>` with the Chrome version Teams for Linux reports. Any stable application-identifier token works; the requirement is only that one is present. The default user agent is intentionally left without one, because changing it for everyone would risk other Microsoft sign-in methods and calls.

**Related GitHub Issues:** [Issue #2646](https://github.com/IsmaelMartinez/teams-for-linux/issues/2646), [Issue #1414](https://github.com/IsmaelMartinez/teams-for-linux/issues/1414)

---

### Notifications

#### Issue: No Desktop Notifications

**Description:** Some Linux notification daemons do not fully support the implementation used by Microsoft in their web version, which may result in certain notifications not being shown.

**Potential Causes:**
*   Incompatibility between Linux notification systems and Teams' notification implementation.
*   Incorrect notification settings.

**Solutions/Workarounds:**

1.  **Check Configuration:** Please refer to the `notifications.method`, and other notification settings, in the [Configuration Documentation](configuration.md) for more information.

---

#### Issue: Notifications disappear from the notification center on GNOME

**Description:** On GNOME (and some other desktops), system notifications vanish from the notification center when Teams's in-page purple toast times out, before the user has had a chance to read them. The tray badge counter can also clear at the same time.

**Potential Causes:**

* On the default `web` notification method, Teams's in-page code calls `notification.close()` when its own toast times out. That call propagates through Chromium's DOM `Notification` API to libnotify, which then dismisses the system notification.

**Solutions/Workarounds:**

1. Switch to the `electron` notification method, which keeps the system notification independent of Teams's in-page lifecycle. Optionally also set `notifications.timeoutType: "never"` so notifications persist until you dismiss them:

    ```json
    {
      "notifications": { "method": "electron", "timeoutType": "never" }
    }
    ```

   The `electron` path fetches sender avatars through the authenticated Teams session. If an avatar cannot be loaded, the notification still appears without it.

**Related GitHub Issues:** [#2411](https://github.com/IsmaelMartinez/teams-for-linux/issues/2411)

---

### Wayland / Display Issues

:::info Default Behavior
Since v2.29.0 the deb, rpm and AppImage packages ship no `--ozone-platform` flag, so Chromium picks the backend per session: native Wayland on a Wayland session, X11 otherwise. The snap still launches with `--ozone-platform=x11` (see [ADR-034](development/adr/034-native-wayland-default.md)). To force a backend, pass `--ozone-platform=x11` or `--ozone-platform=wayland` on the command line or in your `.desktop` file.

If you had `wayland.xwaylandOptimizations` enabled on an earlier release, it only applies when the app runs under XWayland, which it no longer does by default: add `--ozone-platform=x11` to your `Exec=` line to keep it.
:::

#### Issue: Blank or black window on Wayland

**Description:** The application window appears blank, black, or white when running on a Wayland session. This is caused by Electron 38+ regressions in native Wayland mode.

**Solutions/Workarounds:**

1. **Force X11 mode** by launching with `--ozone-platform=x11`:
    ```bash
    teams-for-linux --ozone-platform=x11
    ```
2. **Edit your `.desktop` file** to make the override permanent by adding `--ozone-platform=x11` to the `Exec=` line. Copy it to `~/.local/share/applications/` first so a package update does not overwrite it.

**Related GitHub Issues:** [#1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604), [#1494](https://github.com/IsmaelMartinez/teams-for-linux/issues/1494), [#519](https://github.com/IsmaelMartinez/teams-for-linux/issues/519), [#504](https://github.com/IsmaelMartinez/teams-for-linux/issues/504)

#### Issue: Maximized window has gaps or resizes on focus loss

**Description:** Since v2.7.0, maximizing the window doesn't fill the screen completely, leaving gaps. The window may also shrink when it loses focus.

**Solutions/Workarounds:**

1. **Force X11 mode** with `--ozone-platform=x11` to avoid Wayland window management regressions.
2. If this still happens on v2.29.0 or later, please report it with your desktop, compositor and monitor layout: the native Wayland default depends on these reports.

**Related GitHub Issues:** [#2094](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094)

#### Issue: Blurry UI or fonts with fractional scaling on Wayland

**Description:** Text and UI elements appear blurry when using fractional display scaling (e.g., 125%) on Wayland while running under XWayland (X11 mode).

**Potential Causes:**
* X11 mode does not handle Wayland fractional scaling natively.

**Solutions/Workarounds:**

1. **Check you are not forcing X11.** Since v2.29.0 the deb, rpm and AppImage run native Wayland on a Wayland session unless a `.desktop` edit or command line still passes `--ozone-platform=x11`. The snap always runs under XWayland.
2. **Override to native Wayland mode** where it is still forced:
    ```bash
    teams-for-linux --ozone-platform=wayland
    ```

**Related GitHub Issues:** [#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787)

#### Issue: Audio/video lag during calls on Wayland

**Description:** Calls exhibit audio or video lag on Wayland sessions. Teams for Linux auto-disables GPU composition on Wayland by default, forcing software encoding even on stacks that would otherwise handle hardware acceleration fine.

**Potential Causes:**
* Teams for Linux automatically disables GPU composition on Wayland sessions by default to ensure stability, which can result in software-based rendering and increased lag during calls.

**Solutions/Workarounds:**

1. **Re-enable GPU acceleration** by setting `performance.disableGpu` to `false` in your `config.json` file (see the [Installation and Updates](#installation-and-updates) section for the configuration folder path corresponding to your installation method):
    ```json
    {
      "performance": {
        "disableGpu": false
      }
    }
    ```
2. **Verify hardware acceleration** is active via **Debug → Open GPU Info** from the application menu (or `chrome://gpu` via DevTools), confirming the video decode/encode entries are hardware-accelerated.

**Related GitHub Issues:** [#2410](https://github.com/IsmaelMartinez/teams-for-linux/issues/2410)

#### Issue: Screen share receive fails or video glitches under Electron 41 (X11)

**Description:** On X11 sessions, after upgrading to teams-for-linux 2.8.0 (which bumped Electron to 41), one-on-one incoming screen shares can fail to render or the shared video stays blank. The log typically contains `ERROR:gpu/command_buffer/service/shared_image/shared_image_manager.cc: SharedImageManager::ProduceSkia: Trying to Produce a Skia representation from a non-existent mailbox.` emitted by the GPU process during the call. The symptom did not reproduce on teams-for-linux 2.7.13 (Electron 39). Reports on #2459 cover NVIDIA proprietary, AMD Radeon 780M, and Intel integrated graphics, so this is not vendor-specific.

**Potential Causes:**
* Electron 41 ships a newer Chromium with updated GPU SharedImage handling that regressed across several driver stacks on X11. X11 sessions keep GPU acceleration on by default (unlike Wayland, which auto-disables), so the regression is hit unmodified.

**Solutions/Workarounds:**

1. **Disable GPU acceleration** by setting `performance.disableGpu` to `true` in `~/.config/teams-for-linux/config.json`:
    ```json
    {
      "performance": {
        "disableGpu": true
      }
    }
    ```
2. **Alternatively**, launch with `--disable-gpu` on the command line, or add it to the `Exec=` line of a custom copy of the `.desktop` entry under `~/.local/share/applications/teams-for-linux.desktop`.

**Related GitHub Issues:** [#2459](https://github.com/IsmaelMartinez/teams-for-linux/issues/2459)

#### Issue: Sharing the whole screen shows black under XWayland, sharing a window works

**Description:** The snap launches with `--ozone-platform=x11`, so on a Wayland session it runs under XWayland and screen capture goes through the X11 capturer, which only sees X11 windows. Sharing a single window works, but sharing the whole screen shows a black feed. The same applies to any package launched with `--ozone-platform=x11` by hand. Since v2.29.0 the deb, rpm and AppImage run as native Wayland by default, like Flatpak and tar.gz, and are not affected.

**Solutions/Workarounds:**

1. **Share a window** instead of the whole screen.

**Related GitHub Issues:** [#3066](https://github.com/IsmaelMartinez/teams-for-linux/issues/3066)

:::note Important
The `performance.electronCLIFlags` config option (`config.json`) **cannot** override `--ozone-platform` because the flag must be set before the Electron process starts, and config is loaded after. Use command-line arguments or `.desktop` file edits instead.
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
