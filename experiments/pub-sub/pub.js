
const RedisClientFactory = require("../../redis-client-factory");

class Pub {

    client;
    runCallback;
    id = 1;

    constructor() {
        this.runCallback = this.run.bind(this);
        this.client = RedisClientFactory.startClient(this.runCallback);
    }

    run() {
        this.client.publish("channel-123", this.id);
        console.info(`Published message ${this.id}.`);
        this.id++;
        setTimeout(this.runCallback, 1000);
    }
}

new Pub();
