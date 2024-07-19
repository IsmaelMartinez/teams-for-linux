# Custom Background Example

This project demonstrates the use of a custom background in service. It leverages the `http-server` npm package to serve the application on port 80. But you should be able to use any server to serve the application.

## Prerequisites

Before running this example, ensure you have Node.js and npm installed on your system. You can download and install them from [Node.js official website](https://nodejs.org/).

## Running the Application

To start the server and serve the application on port 80, run the following command in your terminal:

```bash
npx http-server -p 80 --cors "*" -g
```

You can now access the application by navigating to `http://localhost` in your browser.

Remember to start the program with the appropriate config options to enable the custom background as detailed in the [Config Readme](../../config/README.md).

Images are from unsplash.com and are free to use from:

* [Colin Horn](https://unsplash.com/photos/green-thick-forest-during-daytime-fR9U2S31Exs)
* [Kurt Cotoaga](https://unsplash.com/photos/a-large-sand-dune-with-a-blue-sky-in-the-background-WvzhI-31ku0)
* [Visar Neziri](https://unsplash.com/photos/aerial-photography-of-rock-formation-CAQvwCoHLhw)

From this group (https://unsplash.com/wallpapers/screen/1920x1080).

Feel free to submit a PR with other images you would like to see in the app, or to replace the existing ones.