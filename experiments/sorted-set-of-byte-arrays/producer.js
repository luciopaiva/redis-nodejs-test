
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
    chunkPeriodInMillis = 0;
    chunkCount = 1;
    currentChunk = 0;
    chunks = [];

    constructor(minId = this.minId, maxId = this.maxId,
                periodInMillis = settings.DEFAULT_PRODUCER_PERIOD_IN_MILLIS,
                chunkCount = this.chunkCount) {
        this.minId = Number(minId);
        this.maxId = Number(maxId);
        periodInMillis = Number(periodInMillis);
        this.chunkCount = Number(chunkCount);

        const itemsPerChunk = Math.trunc((this.maxId - this.minId + 1) / this.chunkCount);
        for (let i = this.minId; i <= this.maxId; i += itemsPerChunk) {
            this.chunks.push([i, Math.min(i + itemsPerChunk - 1, this.maxId)]);
        }

        this.chunkPeriodInMillis = periodInMillis / this.chunks.length;

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

        setTimeout(this.runCallback, this.chunkPeriodInMillis);
    }

    async updateKeysAndSortedSetWithRefToValue(now, batch) {
        const timestampsAndIds = [];

        const [minId, maxId] = this.getAndUpdateChunk();

        for (let i = minId; i <= maxId; i++) {
            const key = this.itemKeys.get(i);

            timestampsAndIds.push(now);
            timestampsAndIds.push(key);

            batch.setex(key, settings.EXPIRATION_TIME_IN_SECONDS, this.itemValues.get(i));
        }
        batch.zadd("latest-ids", ...timestampsAndIds);
    }

    async updateKeysAndSortedSetWithActualValue(now, batch) {
        const timestampsAndIds = [];

        const [minId, maxId] = this.getAndUpdateChunk();

        for (let i = minId; i <= maxId; i++) {
            timestampsAndIds.push(now);
            timestampsAndIds.push(this.itemValues.get(i));
        }
        batch.zadd("latest-ids", ...timestampsAndIds);
    }

    getAndUpdateChunk() {
        const chunk = this.chunks[this.currentChunk];
        this.currentChunk = (this.currentChunk + 1) % this.chunks.length;
        return chunk;
    }
}

new Producer(...process.argv.slice(2));
