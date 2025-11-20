# Screen Sharing in Teams for Linux

Teams for Linux provides screen sharing capabilities that integrate with the Microsoft Teams web interface.

When you start screen sharing, a selection dialog appears showing available screens and windows. Once sharing begins, an optional preview window shows what you're sharing.

## Configuration

### Screen Sharing Thumbnail Settings

To find your config file [see the “Configuration” section](configuration#configuration-locations)

```json
{
  "screenSharingThumbnail": {
    "enabled": true,
    "alwaysOnTop": true
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the preview thumbnail window |
| `alwaysOnTop` | `boolean` | `true` | Keep preview window always on top of other windows |

### Disabling Screen Sharing Preview

To disable the preview window entirely:

```json
{
  "screenSharingThumbnail": {
    "enabled": false
  }
}
```

## Troubleshooting

### Common Issues

#### Preview Window Not Appearing
- **Check configuration**: Ensure `screenSharingThumbnail.enabled` is `true`
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
