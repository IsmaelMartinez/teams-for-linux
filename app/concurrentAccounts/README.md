# Concurrent Accounts

Launches up to **3** isolated Teams for Linux processes so two or three
accounts can stay connected at the same time. This is the in-app form of
the documented `--user-data-dir` workflow, not the ADR-020 in-window
profile switcher.

See [ADR-027](../../docs-site/docs/development/adr/027-concurrent-account-instances.md).

## Behaviour

- Each extra account is a new Electron process with its own user-data
  directory, window class, tray icon, and Teams session.
- Hard cap of 3 accounts in the shared registry (the original instance
  plus two extras).
- **Accounts → Open another account…** creates the extra directory and
  starts it immediately.
- **Accounts → Manage accounts…** renames or removes extras (the original
  account cannot be removed). Until you rename it, the original account
  shows the signed-in email instead of **This account**.
- When `instances.autoLaunch` is true (the default), the first process
  starts the other configured accounts. Child processes skip that step
  so they do not spawn each other in a loop.

## Files

| File | Role |
| --- | --- |
| `index.js` | `ConcurrentAccountsManager` — CRUD, IPC, spawn orchestration |
| `registry.js` | Registry file, cap, path helpers, pid / family marker |
| `identity.js` | Email validation and display label (`This account` → email) |
| `launcher.js` | Build spawn command/args; skip-auto-launch env |
| `addAccount/` | Add-account dialog |
| `manageAccounts/` | Manage-accounts dialog |

## Storage

The registry lives in the **home** instance's userData directory as
`concurrent-accounts.json`. Extra instances live in a sibling folder:

```
~/.config/teams-for-linux/                      # home instance
~/.config/teams-for-linux/concurrent-accounts.json
~/.config/teams-for-linux-instances/<uuid>/     # extra instance
```

Each extra directory contains `instance-family.json` pointing back at
the home userData path so any instance can find the registry.

## Config

```json
{
  "instances": {
    "enabled": true,
    "autoLaunch": true
  }
}
```

Set `instances.enabled` to `false` to hide the Accounts menu and skip
auto-launch. The `--user-data-dir` CLI workflow is unchanged.
