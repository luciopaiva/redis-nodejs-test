
# Redis Node.js experiments

Some experiments to understand how Redis works.

## Setup local Redis server

In case you have a remote Redis server ready, just skip this step. To install redis locally:

    brew install redis

Start the redis server using the conf file in this repo:

    redis-server redis.conf

It will start the server in memory-only mode (RDB and AOF are disabled, so no writes to disk, nothing is persisted).

## Setup local environment

    nvm install
    npm install

Create a file named `config.json` with options to be directly passed to the `redis` module. Create a file with an empty object (`{}`) if you'd like to keep all the default settings.

## ElastiCache Redis server

If you are running an ElastiCache Redis server, here are some things to have in mind.

When running in cluster mode, you may see the following message:

    ReplyError: MOVED 3123 <ip-address>:6379
    at parseError (/Users/lucio/projects/redis-nodejs-test/node_modules/redis-parser/lib/parser.js:179:12)
    at parseType (/Users/lucio/projects/redis-nodejs-test/node_modules/redis-parser/lib/parser.js:302:14) {
    command: { name: 'exists', args: [ '50' ] }
    }

It means the Redis server node you are directly connected to is signaling you should connect to another node. For `ioredis` (the underlying library used by this project to connect to Redis) to work in cluster mode, see [this](https://stackoverflow.com/a/64871857/778272).

Alternatively, you can also connect directly to that node by referencing the IP address in the config.json file.

## Run experiment

See `producer.js` and `exists-consumer.js`. The producer will set Redis keys containing a payload of 128 bytes each. The consumer will check if a given key exists and just return true or false.

For example, to run the producer:

    node producer.js 100001 200000

This would generate 100k transmissions per second. Watch the log and keep an eye on the time it takes to transmit the data; if it's taking more than your period, you are not transmitting at the intended rate. It could be because either the client or the server is acting as a bottleneck.

For example, a test on AWS with 1 c5.xlarge machine client producing 200k items of 100 bytes each per second, sending to a t2.small on Elasticache, was able to keep a consistent rate for some good minutes, but then decreased to about half of the expected tranmission rate. After dividing the client load between 2 c5.xlarge, each running 3 individual processes, for the same total of 200k/s, even then the rate kept below what was expected. On the client side, each expected 1 second period was taking about 2 seconds to run. That was because the server was taking too long to respond and the next batch only starts after the response arrives (more on that later). So I tried upgrading the server.

First I tried an m3 type, but it ended up being slower than a t2. Since the m type didn't do it, I decided to experiment with the r6, the latest r type (btw, picking the latest generation does not imply more expensive machines; usually it's quite the contrary and you'll probably pay more for a r4). I chose the r6g.large, which worked very well of that same load and did not see the drop anymore.

On the comment I made above about a new batch only being allowed to start after the response of the current one was received, I did that because the Node.js process was crashing with OOM exceptions. I tried two npm packages, `redis` and `ioredis` and both suffered of the same problem. I believe it is possible to pipeline more commands to Redis still using a single Node.js process, but that problem would need to be solved.
