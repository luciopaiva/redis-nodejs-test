
const RedisClientFactory = require("../../redis-client-factory");

class Pub {

    client;
    runCallback;
    id = 1;
    static totalChannels = 2000;

    constructor() {
        this.runCallback = this.run.bind(this);
        this.client = RedisClientFactory.startClient(this.runCallback);
    }

    async run() {
        const startTime = performance.now();

        const batch = this.client.pipeline();
        for (let i = 0; i < Pub.totalChannels; i++) {
            batch.publish("channel-" + i, this.id);
        }
        await batch.exec();

        this.id++;

        const elapsed = Math.round(performance.now() - startTime);
        console.info(`Batch dispatched (took ${elapsed} ms)`);

        setTimeout(this.runCallback, 1000);
    }
}

if (require.main === module) {
    new Pub();
} else {
    module.exports = Pub;
}
