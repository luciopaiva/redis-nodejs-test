
const fs = require("fs");
const path = require("path");
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
    shouldWriteUsingScript = false;

    constructor({quantity, periodInMillis, chunkCount, agent, totalAgents, storeActualValue, shouldWriteUsingScript}) {
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
        this.shouldWriteUsingScript = shouldWriteUsingScript;

        this.client = RedisClientFactory.startClient(this.runCallback);

        for (let i = this.minId; i <= this.maxId; i++) {
            this.itemKeys.set(i, `item:${i}`);
            this.itemValues.set(i, utils.obtainDummyPayload(i, 128));
        }

        if (this.shouldWriteUsingScript) {
            this.client.defineCommand("storeItems", {
                lua: fs.readFileSync(path.join(__dirname, "store-items.lua"), "utf-8"),
            });
        }
    }

    async run() {
        await this.doRun();
        setTimeout(this.runCallback, this.chunkPeriodInMillis);
    }

    async doRun() {
        const processingStart = performance.now();
        const now = Date.now();

        const batch = this.client.pipeline();

        if (this.nextTimeShouldCleanExpired < now) {
            // remove expired elements
            batch.zremrangebyscore("latest-ids", "-inf", now - settings.EXPIRATION_TIME_IN_MILLIS);
            this.nextTimeShouldCleanExpired = now + settings.PURGE_PERIOD_IN_MILLIS;
        }

        if (this.shouldWriteUsingScript) {
            await this.updateKeysAndSortedSetUsingScript(now, batch);
        } else if (this.storeActualValue) {
            await this.updateKeysAndSortedSetWithActualValue(now, batch);
        } else {
            await this.updateKeysAndSortedSetWithRefToValue(now, batch);
        }

        const processingTime = Math.round(performance.now() - processingStart);

        const networkingStart = performance.now();
        const responses = await batch.exec();

        console.info("Responses:");
        for (const response of responses) {
            const [err, result] = response;
            if (err) {
                console.error(" - " + err);
            } else {
                console.info(" - " + result);
            }
        }
        const networkingTime = Math.round(performance.now() - networkingStart);

        const totalTime = processingTime + networkingTime;
        console.info(`Processing items [${this.minId}, ${this.maxId}]: ` +
            `${processingTime} ms - Networking: ${networkingTime} ms - Total: ${totalTime} ms`);
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

    async updateKeysAndSortedSetUsingScript(now, batch) {
        this.setAndUpdateChunk();

        const keys = [];
        const values = [];

        for (let i = this.minId; i <= this.maxId; i++) {
            // console.info(`Preparing item ${i}`);
            keys.push(this.itemKeys.get(i));
            values.push(this.itemValues.get(i));
        }

        const params = [0, now, ...keys, ...values];
        // console.info(...params);

        batch.storeItems(...params);
    }

    async updateKeysAndSortedSetWithActualValue(now, batch) {
        const timestampsAndValues = [];

        this.setAndUpdateChunk();

        for (let i = this.minId; i <= this.maxId; i++) {
            timestampsAndValues.push(now);
            timestampsAndValues.push(this.itemValues.get(i));
        }
        batch.zadd("latest-ids", ...timestampsAndValues);
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
        // whether a Lua script should be used to write keys and sorted set
        shouldWriteUsingScript: false,
    },
    alias: {
        quantity: ["q"],
        periodInMillis: ["p"],
        agent: ["a"],
        totalAgents: ["t"],
        storeActualValue: ["actual-value"],
        shouldWriteUsingScript: ["ws"],
    }
});

new Producer(argv);
