#!/bin/bash

# connecting to server ssh session
ssh -t debian@176.31.123.93 "cd ./webrtc_mediasoup ; bash --login"

exit 0