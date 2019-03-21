#!/bin/bash

docker run -it -v `pwd`:/src node:latest /bin/bash /src/dockerBuildInside.sh
