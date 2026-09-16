# Screen Sharing in Teams for Linux

Teams for Linux provides screen sharing capabilities that integrate with the Microsoft Teams web interface.

When you start screen sharing, a full-window picker overlay appears showing thumbnails of all available screens and windows. Selecting a source shows a detail panel with a larger preview before you confirm. Once sharing begins, an optional floating preview window shows what you're sharing.

## Configuration

### Screen Sharing Thumbnail Settings

To find your config file [see the “Configuration” section](configuration.md#configuration-locations)

```json
{
  "screenSharing": {
    "thumbnail": {
      "enabled": true,
      "alwaysOnTop": true
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `screenSharing.thumbnail.enabled` | `boolean` | `true` | Enable/disable the preview thumbnail window |
| `screenSharing.thumbnail.alwaysOnTop` | `boolean` | `true` | Keep preview window always on top of other windows |

### Screen Sharing Resolution Settings

Resolution control is disabled by default. When `screenSharing.resolution.enabled` is `false`, the app leaves Teams' resolution constraints unchanged, this can result in a lower resolution screen share than your native resolution. Enable it when you want to control the resolution sent by screen sharing, particularly on high-resolution or ultrawide displays.

- `remove` removes Teams' screen-share resolution constraints so the selected screen or window can be captured at its native resolution. This may increase CPU, bandwidth, and encoder usage.
- `override` requests the configured `width` and `height` as a maximum sharing resolution. This is useful when native resolution is unnecessarily expensive or when a known ceiling gives better results for a meeting.

For example, cap a 3440x1440 display at 2560x1080:

```json
{
  "screenSharing": {
    "resolution": {
      "enabled": true,
      "mode": "override",
      "width": 2560,
      "height": 1080
    }
  }
}
```

To request native resolution instead:

```json
{
  "screenSharing": {
    "resolution": {
      "enabled": true,
      "mode": "remove"
    }
  }
}
```

### Disabling Screen Sharing Preview

To disable the preview window entirely:

```json
{
  "screenSharing": {
    "thumbnail": {
      "enabled": false
    }
  }
}
```

> **Migration note:** the legacy flat `screenSharingThumbnail` key and `screenLockInhibitionMethod` key were removed in this release. Move any existing values into `screenSharing.thumbnail` and `screenSharing.lockInhibitionMethod` respectively before upgrading.

## Troubleshooting

### Common Issues

#### Preview Window Not Appearing
- **Check configuration**: Ensure `screenSharing.thumbnail.enabled` is `true`
- **Window manager**: Some Linux window managers may interfere with always-on-top windows
- **Restart**: Try restarting Teams for Linux

#### Screen Selection Dialog Not Showing
- **Permissions**: Check if Teams for Linux has screen capture permissions
- **Wayland**: On Wayland, ensure proper screen sharing portal is configured
- **X11**: Verify X11 screen capture is working

#### Poor Performance During Screen Sharing
- **Resolution**: Lower the shared screen resolution if possible
- **Disable GPU acceleration**: Try `--disable-gpu` flag if experiencing issues
- **System resources**: Close unnecessary applications

### Platform-Specific Notes

#### Linux (X11)
- Works out of the box with X11
- No additional permissions required
- Full screen and window sharing supported

#### Linux (Wayland)
- Requires xdg-desktop-portal-wlr or similar
- May need additional portal configuration
- Some window managers have better support than others

#### macOS
- Requires screen recording permissions
- System will prompt for permission on first use
- May need to add Teams for Linux to Security & Privacy settings

#### Windows
- No additional configuration required
- Works with multiple monitors
- Supports window and screen sharing

## Related Documentation

- [Configuration Options](configuration.md) - General application configuration
- [Troubleshooting](troubleshooting.md) - General troubleshooting guide
