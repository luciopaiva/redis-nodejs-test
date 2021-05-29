
# Redis Node.js test

Simple scripts to experiment with Redis via Node.js clients.

## Setup redis server

Install redis locally:

    brew install redis

Start the redis server using the conf file in this repo:

    redis-server redis.conf

It will start the server in memory-only mode (RDB and AOF are disabled, so no writes to disk, nothing is persisted).

## Setup experiment

    nvm install
    npm install

## Run experiment

See producer, exists-consumer, publisher, subscriber and other scripts for examples.
