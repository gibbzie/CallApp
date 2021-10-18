#!/usr/bin/env bash

cd "$(dirname "$0")" && npm install && npm add vite-plugin-mkcert -D && chmod u+x launch.command
