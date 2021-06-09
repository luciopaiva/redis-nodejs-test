
const assert = require("assert");
const RedisClientFactory = require("../../redis-client-factory");

class Sub {

    client;

    constructor() {
        this.client = RedisClientFactory.startClient(this.run.bind(this));
    }

    async run() {
        const count = await this.client.subscribe("channel-123");
        assert.strictEqual(count, 1);
        console.info("Subscribed to channel-123");
        this.client.on("message", this.onMessage.bind(this));
    }

    onMessage(channel, message) {
        console.info(`Received message ${message}.`);
    }
}

new Sub();
