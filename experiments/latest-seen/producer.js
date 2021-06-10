
const RedisClientFactory = require("../../redis-client-factory");

const MAX_ID = 100;
const LATEST_COUNT = 10;

class Producer {

    client;
    runCallback = this.run.bind(this);
    currentId = 0;

    constructor() {
        this.client = RedisClientFactory.startClient(this.runCallback);
    }

    async run() {
        const now = Date.now();
        const timestampsAndIds = [];
        for (let i = this.currentId; i < this.currentId + LATEST_COUNT; i++) {
            timestampsAndIds.push(now);
            timestampsAndIds.push(i);
        }

        const batch = this.client.pipeline();

        // remove expired elements
        batch.zremrangebyscore("latest-ids", "-inf", now - 3000);
        // update elements that have changed during the last second
        batch.zadd("latest-ids", ...timestampsAndIds);
        await batch.exec();

        this.currentId = (this.currentId + LATEST_COUNT) % MAX_ID;

        setTimeout(this.runCallback, 1000);
    }
}

new Producer();
