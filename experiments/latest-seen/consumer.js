
const RedisClientFactory = require("../../redis-client-factory");

class Consumer {

    client;
    runCallback = this.run.bind(this);

    constructor() {
        this.client = RedisClientFactory.startClient(this.runCallback);
    }

    async run() {
        const cardResponse = await this.client.zcard("latest-ids");
        console.info(`Cardinality: ${cardResponse}`);

        const cutOffTime = Date.now() - 3000;
        const response = await this.client.zrangebyscore("latest-ids", cutOffTime, "+inf");
        console.info(response.join(", "));

        setTimeout(this.runCallback, 1000);
    }
}

new Consumer();
