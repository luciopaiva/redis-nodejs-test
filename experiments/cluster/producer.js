
const RedisClientFactory = require("../../redis-client-factory");

class Producer {

    constructor() {
        this.runCallback = this.run.bind(this);
        RedisClientFactory.startClusterClient(this.runCallback);
    }

    async run() {
        console.info("test");
        setTimeout(this.runCallback, 1000);
    }
}

new Producer();
