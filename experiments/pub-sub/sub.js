
const RedisClientFactory = require("../../redis-client-factory");
const Pub = require("./pub");

class Sub {

    client;
    receivedCount = 0;
    gapsCount = 0;
    totalReceivedCount = 0;
    startTimeInMillis = 0;
    latestIdByChannel = new Map();

    constructor() {
        this.client = RedisClientFactory.startClient(this.run.bind(this));
        this.client.on("ready", () => this.startTimeInMillis = performance.now());
        setInterval(() => {
            console.info(`Messages received: ${this.receivedCount}`);
            console.info(`Gaps seen: ${this.gapsCount}`);
            const elapsedInMillis = performance.now() - this.startTimeInMillis;
            const recvPerSec = this.totalReceivedCount / (elapsedInMillis / 1000);
            console.info(`Avg received per second: ${recvPerSec.toFixed(1)}`);
            this.receivedCount = 0;
            this.gapsCount = 0;

            let minId = Number.POSITIVE_INFINITY;
            let maxId = 0;
            for (const id of this.latestIdByChannel.values()) {
                minId = Math.min(minId, id);
                maxId = Math.max(maxId, id);
            }
            console.info(`Current min=${minId} max=${maxId} (total channels: ${this.latestIdByChannel.size})`);
        }, 1000);
    }

    async run() {
        const channels = [];
        for (let i = 0; i < Pub.totalChannels; i += 2) {
            channels.push(`channel-${i}`);
        }

        const count = await this.client.subscribe(...channels);
        console.info(`Subscribed to ${count} channels`);
        this.client.on("message", this.onMessage.bind(this));
    }

    onMessage(channel, message) {
        const id = parseInt(message);
        if (id !== this.latestIdByChannel.get(channel) + 1) {
            this.gapsCount++;
        }
        this.latestIdByChannel.set(channel, id);
        this.receivedCount++;
        this.totalReceivedCount++;
    }
}

new Sub();
