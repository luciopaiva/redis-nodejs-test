
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
        const ids = await this.client.zrangebyscore("latest-ids", cutOffTime, "+inf");
        console.info(ids.join(", "));

        const batch = this.client.pipeline();
        for (const id of ids) {
            batch.hgetall(`item:${id}`);
        }
        const responses = await batch.exec();
        console.info(responses.map(([err, result]) => result));

        setTimeout(this.runCallback, 1000);
    }
}

new Consumer();
