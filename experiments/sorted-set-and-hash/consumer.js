
const path = require("path");
const RedisClientFactory = require("../../redis-client-factory");

const MODE_MANUAL = "manual";
const MODE_SCRIPT = "script";

class Consumer {

    client;
    runCallback = this.run.bind(this);
    mode;

    constructor(mode) {
        this.mode = mode === MODE_SCRIPT ? MODE_SCRIPT : MODE_MANUAL;
        this.client = RedisClientFactory.startClient(this.runCallback);
        if (this.mode === MODE_SCRIPT) {
            this.client.defineCommand("fetchLatestItems", {
                lua: require("fs").readFileSync(path.join(__dirname, "fetch-latest-items.lua"), "utf-8"),
            });
        }
    }

    async run() {
        await (this.mode === MODE_MANUAL ? this.runManual() : this.runScript());
        setTimeout(this.runCallback, 1000);
    }

    async runScript() {
        const cutOffTime = Date.now() - 3000;
        const responses = await this.client.fetchLatestItems(0, cutOffTime);
        console.info(responses);
    }

    async runManual() {
        const cardResponse = await this.client.zcard("latest-ids");
        console.info(`Cardinality: ${cardResponse}`);

        const cutOffTime = Date.now() - 3000;
        const ids = await this.client.zrangebyscore("latest-ids", cutOffTime, "+inf");

        const batch = this.client.pipeline();
        for (const id of ids) {
            batch.hgetall(id);
        }
        const responses = await batch.exec();
        console.info(responses.map(([, result]) => result));
    }
}

new Consumer(...process.argv.slice(2));
