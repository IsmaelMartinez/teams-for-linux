# Custom Backgrounds

Load custom background images during video calls from your own web server.

:::warning Future Changes
Microsoft Teams now supports custom backgrounds natively in the browser. This workaround may be **removed in future releases** to reduce application complexity. Consider using the native Teams custom background feature when possible.
:::

:::tip
See the [example README](https://github.com/IsmaelMartinez/teams-for-linux/tree/main/app/customBackground/example/README.md) for a complete implementation example.
:::

## Important Considerations

1. **Enabling the Feature:**  
   To activate custom backgrounds, launch the application with:  
   `--isCustomBackgroundEnabled=true`

   For Apache2 users, you might need to add a configuration like the following
   in your `/etc/apache2/apache2.conf`:

   ```xml
   <Directory /var/www/>
     Header set Access-Control-Allow-Origin "*"
     Options Indexes FollowSymLinks
     AllowOverride None
     Require all granted
   </Directory>
   ```

2. **Static Image Management:**  
   The app does not currently support adding or removing custom images
   dynamically. You must host your images on a local or remote web server.

3. **Configuration Options:**  
   Two configuration options are used for custom backgrounds:

   - `customBGServiceBaseUrl`: The base URL of your web server providing custom
     background images.
   - `customBGServiceConfigFetchInterval`: The poll interval (in seconds) at
     which the app fetches background configuration data.

4. **URL Structure for Images:**  
   Custom images are always loaded using the pattern:  
   `<customBGServiceBaseUrl>/<image-path>`  
   Make sure your web server is running and that the specified base URL responds
   correctly.

5. **CORS Requirement:**  
   You can use any web server of your choice, but ensure that it includes an
   `Access-Control-Allow-Origin: *` header in its responses so the app can load
   images without cross-origin issues.

## Configuring the List of Images

### Configuration File Location
The list of custom images should be stored at:  
`<customBGServiceBaseUrl>/config.json`

### Example Configuration File
The configuration should be a JSON object with a `videoBackgroundImages`
array. For example:

```json
{
  "videoBackgroundImages": [
    {
      "filetype": "png",
      "id": "Custom_bg01",
      "name": "Custom Background",
      "src": "/evergreen-assets/backgroundimages/<path-to-image>",
      "thumb_src": "/evergreen-assets/backgroundimages/<path-to-thumb-image>"
    }
  ]
}
```

This JSON array allows you to define any number of images. Replace
`<path-to-image>` and `<path-to-thumb-image>` with the actual paths relative
to your `customBGServiceBaseUrl`.

### Configuration Properties

| Property | Description | Recommendations |
|----------|-------------|-----------------|
| `filetype` | The type of image (e.g., jpg, png) | Use common web formats |
| `id` | A unique identifier for the image | Use unique names without spaces |
| `name` | The display name for your image | Keep descriptive but concise |
| `src` | Path to the full-resolution image | Use ~1920x1080 resolution |
| `thumb_src` | Path to the thumbnail image | Use ~280x158 resolution for faster loading |

:::note Path Resolution
Image paths are relative to `customBGServiceBaseUrl`. For example, if your
`customBGServiceBaseUrl` is `https://example.com` and your image is at
`https://example.com/images/sample.jpg`, then `src` would be
`/evergreen-assets/backgroundimages/images/sample.jpg`.
:::

## Setup Examples

### Local Web Server Setup

#### Using Python HTTP Server
```bash
# Navigate to your images directory
cd /path/to/your/images

# Start a simple HTTP server
python3 -m http.server 8080

# Configure Teams for Linux
teams-for-linux --isCustomBackgroundEnabled=true --customBGServiceBaseUrl=http://localhost:8080
```

#### Using Node.js HTTP Server
```bash
# Install http-server globally
npm install -g http-server

# Navigate to your images directory
cd /path/to/your/images

# Start server with CORS enabled
http-server -p 8080 --cors

# Configure Teams for Linux
teams-for-linux --isCustomBackgroundEnabled=true --customBGServiceBaseUrl=http://localhost:8080
```

### Advanced Configuration

#### Persistent Configuration
Add to your `~/.config/teams-for-linux/config.json`:

```json
{
  "isCustomBackgroundEnabled": true,
  "customBGServiceBaseUrl": "http://localhost:8080",
  "customBGServiceConfigFetchInterval": 300
}
```

#### Corporate Environment Setup
For corporate environments with existing web infrastructure:

```json
{
  "isCustomBackgroundEnabled": true,
  "customBGServiceBaseUrl": "https://intranet.company.com/teams-backgrounds",
  "customBGServiceConfigFetchInterval": 3600
}
```

## Troubleshooting

### Common Issues

#### Backgrounds Not Loading
1. **Check CORS headers**: Ensure your web server includes `Access-Control-Allow-Origin: *`
2. **Verify URL accessibility**: Test that `<customBGServiceBaseUrl>/config.json` is reachable
3. **Check image paths**: Ensure image files exist at the specified paths

#### Poor Performance
1. **Optimize image sizes**: Use recommended resolutions (1920x1080 for full, 280x158 for thumbnails)
2. **Adjust fetch interval**: Increase `customBGServiceConfigFetchInterval` to reduce server load
3. **Use local server**: Host images locally for better performance

#### Configuration Not Updating
1. **Check fetch interval**: Ensure `customBGServiceConfigFetchInterval` is set appropriately
2. **Restart application**: Changes may require restarting Teams for Linux
3. **Verify JSON syntax**: Validate your config.json file syntax

### Debug Mode
Enable debug logging to troubleshoot custom background issues:

```bash
teams-for-linux --logConfig='{"level":"debug"}' --isCustomBackgroundEnabled=true
```

## Security Considerations

:::warning Security Notice
- Only host custom backgrounds on trusted servers
- Regularly review and update background image content
- Consider bandwidth usage in corporate environments
- Ensure CORS configuration doesn't overly expose your server
:::

### Best Practices
1. **Use HTTPS**: Secure your background image server with SSL/TLS
2. **Validate Content**: Ensure background images are appropriate for business use
3. **Monitor Usage**: Track bandwidth and server load from background requests
4. **Regular Updates**: Keep background collection fresh and relevant

## Related Documentation

- [Configuration Options](configuration.md) - Complete configuration reference
- [IPC API](ipc-api.md) - Background management IPC channels