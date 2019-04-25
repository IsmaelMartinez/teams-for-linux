#!/bin/bash

docker run -it -v `pwd`:/src node:10.15.3 /bin/bash /src/scripts/dockerBuildInside.sh
