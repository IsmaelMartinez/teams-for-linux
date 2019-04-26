# Contributing

First of all, thanks for thinking about contributing. Hopefully the following guidelines will help you contributing. If you got any questions, do add a issue with your questions and we will try to help.

## Development

This is a fairly small project. IMO, the ideal size for getting started with electron.

Just fork the repo and dive in. The app/index.js is the starting of all the application.

Once changes are made, just do a pull request to develop.

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

#### Use camera using the Snap build

Snap uses confinement to provide more security, this restric the access to hardware or data on your device to prevent security issues.

The camera is a restricted device on Snap, so you need to allow the access to the camera on Teams For Linux to be able to do videocalls, to do that run this command after the installation of the snap to create an interface to the camera:

```bash
sudo snap connect teams-for-linux:camera core:camera
```

## Version number

We are following SemVer at the moment. The lower number in master will be increased after a release (basically, to avoid re-releasing stuff with some changes), but release number will be decided just before a release trying to use SemVer standards.
