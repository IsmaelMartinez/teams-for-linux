# Custom Background Example

This project demonstrates the use of a custom background in the service. It
leverages the `http-server` npm package to serve the application on port 80,
though you can use any web server.

## Prerequisites

Ensure that you have Node.js and npm installed on your system. You can download
them from the [Node.js official website](https://nodejs.org/).

## Running the Application

To start the server on port 80, run the following command in your terminal:

```bash
npx http-server -p 80 --cors "*" -g
```

After the server starts, access the application by navigating to
`http://localhost` in your browser.

> **Note:** Remember to launch Teams for Linux with the appropriate
> configuration options to enable the custom background feature (refer to the
> [README](../README.md) for details).

## Image Credits

The images used in this example are sourced from Unsplash and are free to use:

- [Colin Horn](https://unsplash.com/photos/green-thick-forest-during-daytime-fR9U2S31Exs)
- [Kurt Cotoaga](https://unsplash.com/photos/a-large-sand-dune-with-a-blue-sky-in-the-background-WvzhI-31ku0)
- [Visar Neziri](https://unsplash.com/photos/aerial-photography-of-rock-formation-CAQvwCoHLhw)

These images are part of the
[Unsplash Wallpapers](https://unsplash.com/wallpapers/screen/1920x1080)
collection.

Feel free to submit a pull request to add new images or replace the existing
ones.
