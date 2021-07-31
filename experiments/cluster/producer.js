
const RedisClientFactory = require("../../redis-client-factory");

class Producer {

    client;

    constructor() {
        this.runCallback = this.run.bind(this);
        this.client = RedisClientFactory.startClusterClient(this.runCallback);
    }

    async run() {
        const nodes = await this.client.nodes("all");

        console.info("\nNodes:");
        for (const node of nodes) {
            console.info(node);
        }

        setTimeout(this.runCallback, 1000);
    }
}

new Producer();
