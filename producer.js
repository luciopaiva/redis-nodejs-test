
const redis = require("redis");

const EXPIRATION_TIME_IN_SECONDS = 3;

class Producer {
    buffer;
    minId = 1;
    maxId = 100;
    client;

    constructor() {
        this.buffer = Buffer.allocUnsafe(128);
        for (let i = 0; i < this.buffer.length; i++) {
            this.buffer[i] = i;
        }

        this.sendBatchCallback = this.sendBatch.bind(this);

        this.client = redis.createClient();
        this.client.on("error", error => console.error(error));
        this.client.on("connect", () => console.info("Connected"));
        this.client.on("ready", this.start.bind(this));
    }

    start() {
        console.info("Connection ready. Starting job...");
        this.sendBatch();
    }

    sendBatch() {
        console.info("Starting batch...");
        const startTime = performance.now();

        const batch = this.client.batch();
        for (let i = this.minId; i <= this.maxId; i++) {
            batch.setex(i, EXPIRATION_TIME_IN_SECONDS, this.buffer);
        }
        batch.exec();
        console.info("Batch dispatched");

        const elapsed = performance.now() - startTime;
        setTimeout(this.sendBatchCallback, Math.max(0, 1000 - elapsed));
    }
}

new Producer();
