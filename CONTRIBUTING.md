# Contributing

First of all, thanks for thinking about contributing. Hopefully the following guidelines will help you contributing. If you got any questions, do add a issue with your questions and we will try to help.

## Development

This is a fairly small project. IMO, the ideal size for getting started with electron.

Just fork the repo and dive in. The app/index.js is the starting of all the application.

Once changes are made, just do a pull request in a branch of develop.

Each subfolder has a README.md file that explains the reason of existence and any extra required information.

## Pre-requisites

To run this application from source, you will need yarn installed.

Please refer to the [yarn installation page](https://yarnpkg.com/en/docs/install)

## Run from source

To run the application from source:

```bash
yarn start
```

## Build for linux

We are using [electron-build](https://www.electron.build/) in conbination with [travis-ci](https://travis-ci.org/) to create our build files.

If you want to generate the build locally, you can run the following command:

```bash
yarn run dist:linux
```

### Using a node container and podman (or docker)
If you want to use a node container to create your packages, use this command:
(docker user should replace podman by docker)
```bash
podman run -it --rm --volume .:/var/mnt:z -w /var/mnt/ node:12 /bin/bash -c "apt update && apt install -y rpm && yarn install && yarn run dist:linux"
```

This will build an deb, rpm, snap, AppImage and tar.gz files in the dist folder. This files can be run in most popular linux distributions.

### Snap build

Is possible to specify the snap or AppImage build type using running this:

```bash
# Standalone build
yarn run dist:linux:snap

# Or, if you have docker installed, you can alternatively build there
./dockerBuildSnap.sh
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

## Version number

We are following SemVer at the moment. The lower number in develop will be increased after a release.

Decide the release number before merging to develop following SemVer.
