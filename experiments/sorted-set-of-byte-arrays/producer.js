
const minimist = require("minimist");
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
    storeActualValue;

    constructor({quantity, periodInMillis, chunkCount, agent, totalAgents, storeActualValue}) {
        if (agent < 1 || agent > totalAgents) {
            console.error("Error: agent must be greater than zero and not greater than totalAgents!");
            process.exit(1);
        }

        const itemsPerAgent = Math.trunc(quantity / totalAgents);
        this.minId = itemsPerAgent * (agent - 1) + 1;
        this.maxId = agent === totalAgents ?  // last agent in charge of the rest, even if greater than itemsPerAgent
            quantity : this.minId + itemsPerAgent - 1;

        this.chunkCount = chunkCount;

        const itemsPerChunk = Math.trunc((this.maxId - this.minId + 1) / this.chunkCount);
        for (let i = this.minId; i <= this.maxId; i += itemsPerChunk) {
            this.chunks.push([i, Math.min(i + itemsPerChunk - 1, this.maxId)]);
        }

        this.chunkPeriodInMillis = periodInMillis / this.chunks.length;

        this.storeActualValue = storeActualValue;

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

        if (this.storeActualValue) {
            await this.updateKeysAndSortedSetWithActualValue(now, batch);
        } else {
            await this.updateKeysAndSortedSetWithRefToValue(now, batch);
        }

        const processingTime = Math.round(performance.now() - processingStart);

        const networkingStart = performance.now();
        await batch.exec();
        const networkingTime = Math.round(performance.now() - networkingStart);

        const totalTime = processingTime + networkingTime;
        console.info(`Processing items [${this.minId}, ${this.maxId}]: ` +
            `${processingTime} ms - Networking: ${networkingTime} ms - Total: ${totalTime} ms`);

        setTimeout(this.runCallback, this.chunkPeriodInMillis);
    }

    async updateKeysAndSortedSetWithRefToValue(now, batch) {
        const timestampsAndIds = [];

        this.setAndUpdateChunk();

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

        this.setAndUpdateChunk();

        for (let i = this.minId; i <= this.maxId; i++) {
            timestampsAndIds.push(now);
            timestampsAndIds.push(this.itemValues.get(i));
        }
        batch.zadd("latest-ids", ...timestampsAndIds);
    }

    setAndUpdateChunk() {
        [this.minId, this.maxId] = this.chunks[this.currentChunk];
        this.currentChunk = (this.currentChunk + 1) % this.chunks.length;
    }
}

const argv = minimist(process.argv.slice(2), {
    default: {
        // the total number of items to save across all agents
        quantity: 100,
        // time between batches
        periodInMillis: settings.DEFAULT_PRODUCER_PERIOD_IN_MILLIS,
        // in how many chunks should a batch be split
        chunkCount: 1,
        // this agent's id (must be within [1, totalAgents])
        agent: 1,
        // how many concurrent agents will run
        totalAgents: 1,
        // whether the sorted set should store the actual value instead of a reference to the value
        storeActualValue: settings.SORTED_SET_CONTAINS_ACTUAL_VALUE,
    },
    alias: {
        quantity: ["q"],
        periodInMillis: ["p"],
        agent: ["a"],
        totalAgents: ["t"],
        storeActualValue: ["--actual-value"],
    }
});

new Producer(argv);
