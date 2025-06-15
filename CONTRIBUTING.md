# Contributing

First of all, thank you for considering contributing to this project. We
appreciate your interest and would like to provide some guidelines to help you
get started. If you have any questions, please feel free to open a discussion
and we will be happy to assist you.

## Development

This is a fairly small project, making it ideal for getting started with
Electron.

To contribute, fork the repository and make your changes. The starting point of
the application is `app/index.js`.

After making your changes, submit a pull request to the `main` branch.

Each subfolder contains a `README.md` file that provides additional information
and explains the purpose of the folder.

## Pre-requisites

To run this application from source, you will need npm installed.

Please refer to the
[npm installation page](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)

## Run from source

To run the application from source:

```bash
npm run start
```

## Build for Linux

We are using [electron-build](https://www.electron.build/) in combination with
GitHub Actions to create our build files.

If you want to generate the build locally, you can run the following command:

```bash
npm run dist:linux
```

## Building for other systems

The package is also build for other systems. Check the `package.json` file for
the available build commands.

### Using a node container and podman (or docker)

If you want to use a node container to create your packages, use this command:
(docker user should replace podman by docker)

```bash
podman run -it --rm --volume .:/var/mnt:z -w /var/mnt/ node:20 /bin/bash -c "apt update && apt install -y rpm && npm ci && npm run dist:linux"
```

This will build an deb, rpm, snap, AppImage and tar.gz files in the dist folder.
This files can be run in most popular Linux distributions.

### Snap build

Is possible to specify the snap build type using running this:

```bash
npm run dist:linux:snap
```

This will build the snap into the `dist/` directory.

#### Install using locally built snap file

To install the snap file using the generated file use this command.

```bash
cd dist
sudo snap install teams-for-linux_VERSION_amd64.snap --dangerous
```

#### Install using snap from store

```bash
sudo snap install teams-for-linux
```

## Release process

## Adding Release Notes

To add release notes and prepare a new release, follow these steps:

1. **Update the version** in `package.json` according to the versioning rules:
  - Increment the last number for patches (e.g., `1.0.0` → `1.0.1`)
  - Increment the middle number for minor or breaking changes (e.g., `1.0.0` → `1.1.0`)
  - The first number is reserved

2. **Run** `npm install` to update `package-lock.json`.

3. **Add release notes** for the new version in the [`release_info.md`](release_info.md) file. List new features, bug fixes, and improvements.

4. **Update** `com.github.IsmaelMartinez.teams_for_linux.appdata.xml`:
  - Add a new `<release>` entry with the new version and date, and a summary of changes. For example:

  ```xml
  <release version="2.0.17" date="2025-06-15">
    <description>
     <ul>
      <li>New feature description</li>
      <li>Bug fix description</li>
      <li>Performance improvement</li>
     </ul>
    </description>
  </release>
  ```

5. **Commit and push** your changes, then open a pull request.

The release process is mostly automated using GitHub Actions and is triggered by merging to `main`.

For more details on how the release info is generated, see the [Release Info](docs/RELEASE_INFO.md) documentation.
