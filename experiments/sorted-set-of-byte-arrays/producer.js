
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
    quantity = 0;
    minId = 1;
    maxId = 100;
    chunkPeriodInMillis = 0;
    chunkCount = 1;
    currentChunk = 0;
    chunks = [];
    storeActualValue;
    shouldWriteUsingScript = false;
    shouldWriteUsingSingleKeyScript = false;
    storeIntoList = false;
    countWithHLL = false;
    storeIntoSet = false;

    constructor({quantity, periodInMillis, chunkCount, agent, totalAgents, storeActualValue, shouldWriteUsingScript,
                    shouldWriteUsingSingleKeyScript, storeIntoList, countWithHLL, storeIntoSet, clusterMode}) {
        if (agent < 1 || agent > totalAgents) {
            console.error("Error: agent must be greater than zero and not greater than totalAgents!");
            process.exit(1);
        }

        this.quantity = quantity;
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
        this.shouldWriteUsingSingleKeyScript = shouldWriteUsingSingleKeyScript;
        this.storeIntoList = storeIntoList;
        this.countWithHLL = countWithHLL;
        this.storeIntoSet = storeIntoSet;

        this.client = clusterMode ?
            RedisClientFactory.startClusterClient(this.runCallback) :
            RedisClientFactory.startClient(this.runCallback);

        for (let i = this.minId; i <= this.maxId; i++) {
            this.itemKeys.set(i, `item:${i}`);
            this.itemValues.set(i, utils.obtainDummyPayload(i, 128));
        }

        if (this.shouldWriteUsingScript) {
            this.client.defineCommand("storeItems", {
                lua: fs.readFileSync(path.join(__dirname, "store-items.lua"), "utf-8"),
            });
        } else if (this.shouldWriteUsingSingleKeyScript) {
            this.client.defineCommand("storeItem", {
                lua: fs.readFileSync(path.join(__dirname, "store-item.lua"), "utf-8"),
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

        // remove expired elements
        if (this.nextTimeShouldCleanExpired < now) {
            if (this.storeIntoList) {
                batch.ltrim("latest-ids-list", -this.quantity, -1);
            } else {
                batch.zremrangebyscore("latest-ids", "-inf", now - settings.EXPIRATION_TIME_IN_MILLIS);
            }
            this.nextTimeShouldCleanExpired = now + settings.PURGE_PERIOD_IN_MILLIS;
        }

        if (this.storeIntoSet) {
            await this.updateKeysAndSet(now, batch);
        } else if (this.storeIntoList) {
            await this.updateKeysAndList(now, batch);
        } else if (this.shouldWriteUsingScript) {
            await this.updateKeysAndSortedSetUsingScript(now, batch);
        } else if (this.shouldWriteUsingSingleKeyScript) {
            await this.updateKeysAndSortedSetUsingSingleKeyScript(now, batch);
        } else if (this.storeActualValue) {
            await this.updateKeysAndSortedSetWithActualValue(now, batch);
        } else {
            await this.updateKeysAndSortedSetWithRefToValue(now, batch);
        }

        const processingTime = Math.round(performance.now() - processingStart);

        const networkingStart = performance.now();
        const responses = await batch.exec();

        console.info("Responses:");
        for (const response of responses.slice(0, 5)) {
            const [err, result] = response;
            if (err) {
                console.error(" - " + err);
            } else {
                console.info(" - " + result);
            }
        }
        if (responses.length > 5) {
            console.info("(too many commands - showing only 5 out of " + responses.length + ")");
        }
        const networkingTime = Math.round(performance.now() - networkingStart);

        const totalTime = processingTime + networkingTime;
        console.info(`Processing items [${this.minId}, ${this.maxId}]: ` +
            `${processingTime} ms - Networking: ${networkingTime} ms - Total: ${totalTime} ms`);
    }

    async updateKeysAndSet(now, batch) {
        const ids = [];

        this.setAndUpdateChunk();

        for (let i = this.minId; i <= this.maxId; i++) {
            const key = this.itemKeys.get(i);

            ids.push(key);
            batch.setex(key, settings.EXPIRATION_TIME_IN_SECONDS, this.itemValues.get(i));
        }

        const minute = Math.trunc(Date.now() / 60000);
        batch.sadd("latest-ids:" + minute, ...ids);
        batch.expire("latest-ids:" + minute, 3 * 60);  // keep for 3 minutes
    }

    async updateKeysAndList(now, batch) {
        const ids = [];

        this.setAndUpdateChunk();

        for (let i = this.minId; i <= this.maxId; i++) {
            const key = this.itemKeys.get(i);

            ids.push(key);
            batch.setex(key, settings.EXPIRATION_TIME_IN_SECONDS, this.itemValues.get(i));
        }
        batch.rpush("latest-ids-list", ...ids);

        if (this.countWithHLL) {
            const minute = Math.trunc(Date.now() / 60000);
            batch.pfadd("latest-ids-count:" + minute, ...ids);
            batch.expire("latest-ids-count:" + minute, 3 * 60);  // keep for 3 minutes
        }
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

    async updateKeysAndSortedSetUsingSingleKeyScript(now, batch) {
        this.setAndUpdateChunk();

        for (let i = this.minId; i <= this.maxId; i++) {
            batch.storeItem(1, this.itemKeys.get(i), now, this.itemValues.get(i));
        }
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
        // a variation of the parameter above where we run a script to update a single key + the sorted set for that key
        shouldWriteUsingSingleKeyScript: false,
        // this is a flag to experiment saving to a list instead of a sorted set
        storeIntoList: false,
        // when storeToList is true, this is used to enable a HyperLogLog structure to count items
        countWithHLL: false,
        // similar to storeIntoList, but stores into a set
        storeIntoSet: false,
        // enables the client to work in cluster mode
        clusterMode: false,
    },
    alias: {
        quantity: ["q"],
        periodInMillis: ["p"],
        agent: ["a"],
        totalAgents: ["t"],
        storeActualValue: ["actual-value"],
        shouldWriteUsingScript: ["ws"],
        shouldWriteUsingSingleKeyScript: ["sk"],
        chunkCount: ["c"],
        storeToList: ["sl"],
        countWithHLL: ["slh"],
        storeIntoSet: ["ss"],
        clusterMode: ["cm", "cluster"],
    }
});

new Producer(argv);
