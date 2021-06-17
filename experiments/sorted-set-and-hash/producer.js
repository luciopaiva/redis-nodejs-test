
const RedisClientFactory = require("../../redis-client-factory");

const MAX_ID = 100;
const LATEST_COUNT = 10;

class Producer {

    client;
    runCallback = this.run.bind(this);
    currentId = 0;
    nextTimeShouldCleanExpired = 0;
    hashValues = new Map();
    hashKeys = new Map();

    constructor() {
        this.client = RedisClientFactory.startClient(this.runCallback);
        for (let i = 0; i < MAX_ID; i++) {
            this.hashKeys.set(i, `item:${i}`);
            this.hashValues.set(i, `item-id ${i} some-field foo some-other-field bar`.split(" "));
        }
    }

    async run() {
        const startTime = performance.now();
        const now = Date.now();
        const timestampsAndIds = [];

        const batch = this.client.pipeline();

        if (this.nextTimeShouldCleanExpired < now) {
            // remove expired elements
            batch.zremrangebyscore("latest-ids", "-inf", now - 3000);
            this.nextTimeShouldCleanExpired = now + 6_000;
        }

        // update elements that have changed during the last second
        for (let i = this.currentId; i < this.currentId + LATEST_COUNT; i++) {
            timestampsAndIds.push(now);
            timestampsAndIds.push(i);

            const key = this.hashKeys.get(i);
            batch.hmset(key, this.hashValues.get(i));
            batch.expire(key, 3);
        }
        batch.zadd("latest-ids", ...timestampsAndIds);
        await batch.exec();

        this.currentId = (this.currentId + LATEST_COUNT) % MAX_ID;

        const elapsed = Math.round(performance.now() - startTime);
        console.info(`Batch dispatched (took ${elapsed} ms)`);

        setTimeout(this.runCallback, 1000);
    }
}

new Producer();
