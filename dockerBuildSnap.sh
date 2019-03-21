#!/bin/bash

docker run -it -v `pwd`:/src node:latest /bin/bash /src/scripts/dockerBuildInside.sh
