# Custom backgrounds

We have added a feature to load custom background images during video calls. For
a complete example of this feature, please see the
[example README](example/README.md).

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

1. **Static Image Management:**  
   The app does not currently support adding or removing custom images
   dynamically. You must host your images on a local or remote web server.

1. **Configuration Options:**  
   Two configuration options are used for custom backgrounds:

   - `customBGServiceBaseUrl`: The base URL of your web server providing custom
     background images.
   - `customBGServiceConfigFetchInterval`: The poll interval (in seconds) at
     which the app fetches background configuration data.

1. **URL Structure for Images:**  
   Custom images are always loaded using the pattern:  
   `<customBGServiceBaseUrl>/<image-path>`  
   Make sure your web server is running and that the specified base URL responds
   correctly.

1. **CORS Requirement:**  
   You can use any web server of your choice, but ensure that it includes an
   `Access-Control-Allow-Origin: *` header in its responses so the app can load
   images without cross-origin issues.

## Configuring the List of Images

1. **Configuration File Location:**  
   The list of custom images should be stored at:  
   `<customBGServiceBaseUrl>/config.json`

1. **Example Configuration File:**  
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

### About the Entries

- `filetype`: The type of image (e.g., jpg, png).
- `id`: A unique identifier for the image (use a unique name without spaces).
- `name`: The display name for your image.
- `src`: The path to the image that will load when selected from the preview.
  Recommendation: Use an image with a resolution of around 1920x1080 to avoid
  unnecessary traffic from loading oversized images.
- `thumb_src`: The path to the image shown on the preview screen.
  Recommendation: Provide a lower resolution image (approximately 280x158) to
  ensure faster preview loading.

Image paths are relative to `customBGServiceBaseUrl`. For example, if your
`customBGServiceBaseUrl` is `https://example.com` and your image is at
`https://example.com/images/sample.jpg`, then `src` would be
`/evergreen-assets/backgroundimages/images/sample.jpg`.
