
const RedisClientFactory = require("../../redis-client-factory");
const utils = require("../../utils");
const settings = require("./settings");

class Producer {

    client;
    runCallback = this.run.bind(this);
    nextTimeShouldCleanExpired = 0;
    itemKeys = new Map();
    itemValues = new Map();
    minId = 1;
    maxId = 100;
    periodInMillis = settings.DEFAULT_PRODUCER_PERIOD_IN_MILLIS;

    constructor(minId = this.minId, maxId = this.maxId, periodInMillis = this.periodInMillis) {
        this.minId = Number(minId);
        this.maxId = Number(maxId);
        this.periodInMillis = Number(periodInMillis);

        this.client = RedisClientFactory.startClient(this.runCallback);
        for (let i = this.minId; i <= this.maxId; i++) {
            this.itemKeys.set(i, `item:${i}`);
            this.itemValues.set(i, utils.obtainDummyPayload(i, 128));
        }
    }

    async run() {
        const processingStart = performance.now();
        const now = Date.now();

        const batch = this.client.pipeline();

        if (this.nextTimeShouldCleanExpired < now) {
            // remove expired elements
            batch.zremrangebyscore("latest-ids", "-inf", now - settings.EXPIRATION_TIME_IN_MILLIS);
            this.nextTimeShouldCleanExpired = now + settings.PURGE_PERIOD_IN_MILLIS;
        }

        if (settings.SORTED_SET_CONTAINS_ACTUAL_VALUE) {
            await this.updateKeysAndSortedSetWithActualValue(now, batch);
        } else {
            await this.updateKeysAndSortedSetWithRefToValue(now, batch);
        }

        const processingTime = Math.round(performance.now() - processingStart);

        const networkingStart = performance.now();
        await batch.exec();
        const networkingTime = Math.round(performance.now() - networkingStart);

        const totalTime = processingTime + networkingTime;
        console.info(`Processing: ${processingTime} ms - Networking: ${networkingTime} ms - Total: ${totalTime} ms`);

        setTimeout(this.runCallback, this.periodInMillis);
    }

    async updateKeysAndSortedSetWithRefToValue(now, batch) {
        const timestampsAndIds = [];

        for (let i = this.minId; i <= this.maxId; i++) {
            const key = this.itemKeys.get(i);

            timestampsAndIds.push(now);
            timestampsAndIds.push(key);

            batch.setex(key, settings.EXPIRATION_TIME_IN_SECONDS, this.itemValues.get(i));
        }
        batch.zadd("latest-ids", ...timestampsAndIds);
    }

    async updateKeysAndSortedSetWithActualValue(now, batch) {
        const timestampsAndIds = [];

        for (let i = this.minId; i <= this.maxId; i++) {
            timestampsAndIds.push(now);
            timestampsAndIds.push(this.itemValues.get(i));
        }
        batch.zadd("latest-ids", ...timestampsAndIds);
    }
}

new Producer(...process.argv.slice(2));
