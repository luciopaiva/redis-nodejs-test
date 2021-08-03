
const path = require("path");
const minimist = require("minimist");
const RedisClientFactory = require("../../redis-client-factory");
const settings = require("./settings");

class Consumer {

    client;
    runCallback = this.run.bind(this);
    scriptMode;
    limit;

    constructor({scriptMode, clusterMode, limit}) {
        this.scriptMode = Consumer.parseMode(scriptMode);
        this.limit = limit;
        this.client = clusterMode ?
            RedisClientFactory.startClusterClient(this.runCallback) :
            RedisClientFactory.startClient(this.runCallback);

        if (this.scriptMode) {
            this.client.defineCommand("fetchLatestItems", {
                lua: require("fs").readFileSync(path.join(__dirname, "fetch-latest-items.lua"), "utf-8"),
            });
        }
    }

    async run() {
        const startTime = performance.now();

        if (settings.SORTED_SET_CONTAINS_ACTUAL_VALUE) {
            await this.runSortedSetWithActualValue();
        } else {
            await (this.scriptMode ? this.runScript() : this.runManual());
        }

        const elapsed = Math.round(performance.now() - startTime);
        console.info(`Batch processed (took ${elapsed} ms)`);

        setTimeout(this.runCallback, settings.DEFAULT_CONSUMER_PERIOD_IN_MILLIS);
    }

    async runSortedSetWithActualValue() {
        const cardResponse = await this.client.zcard("latest-ids");
        console.info(`Cardinality: ${cardResponse}`);

        const cutOffTime = Date.now() - settings.EXPIRATION_TIME_IN_MILLIS;
        const values = await this.client.zrangebyscore("latest-ids", cutOffTime, "+inf");

        console.info(`Values received: ${values.length}`);
    }

    async runScript() {
        const cutOffTime = Date.now() - settings.EXPIRATION_TIME_IN_MILLIS;
        const responses = await this.client.fetchLatestItems(0, cutOffTime);

        console.info(`Cardinality: ${responses[0]}`);
    }

    async runManual() {
        const cardResponse = await this.client.zcard("latest-ids");
        console.info(`Cardinality: ${cardResponse}`);

        const cutOffTime = Date.now() - settings.EXPIRATION_TIME_IN_MILLIS;
        const ids = await (this.limit > 0 ?
            this.client.zrevrangebyscore("latest-ids", "+inf", cutOffTime, "limit", "0", this.limit) :
            this.client.zrangebyscore("latest-ids", cutOffTime, "+inf"));
        console.info(ids);
        if (ids.length > 0) {
            const batch = [];
            for (const id of ids) {
                console.info(id);
                batch.push(this.client.get(id));
            }

            const responses = await Promise.all(batch);
            console.info(`Responses received: ${responses.length}`);
        }
    }

    static parseMode(cmd) {
        if (typeof cmd !== "string") {
            return settings.DEFAULT_CONSUMER_LUA_SCRIPT_MODE;
        }
        cmd = cmd.toLowerCase();
        switch (cmd) {
            case settings.CONSUMER_MODE_PARAM_MANUAL: return false;
            case settings.CONSUMER_MODE_PARAM_SCRIPT: return true;
            default: return settings.DEFAULT_CONSUMER_LUA_SCRIPT_MODE;
        }
    }
}

const argv = minimist(process.argv.slice(2), {
    default: {
        scriptMode: settings.CONSUMER_MODE_PARAM_MANUAL,
        clusterMode: false,
        limit: 0,
    },
    alias: {
        scriptMode: ["s", "script-mode"],
        clusterMode: ["cm", "cluster"],
    }
});

new Consumer(argv);
