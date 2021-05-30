
const Redis = require("ioredis");
const clientConfig = require("./config.json");

const EXPIRATION_TIME_IN_SECONDS = 3;

class Producer {
    buffer;
    minId = 1;
    maxId = 100;
    periodInMillis = 1000;
    client;

    constructor(minId = this.minId, maxId = this.maxId, periodInMillis = this.periodInMillis) {
        this.minId = minId;
        this.maxId = maxId;
        this.periodInMillis = periodInMillis;

        this.buffer = Buffer.allocUnsafe(128);
        for (let i = 0; i < this.buffer.length; i++) {
            this.buffer[i] = i;
        }

        this.sendBatchCallback = this.sendBatch.bind(this);

        this.client = new Redis(clientConfig);
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

        const batch = this.client.pipeline();
        for (let i = this.minId; i <= this.maxId; i++) {
            batch.setex(i, EXPIRATION_TIME_IN_SECONDS, this.buffer);
        }
        batch.exec(err => {
            if (err) {
                console.error(err);
            }

            const elapsed = Math.round(performance.now() - startTime);
            console.info(`Batch dispatched (took ${elapsed} ms)`);
            setTimeout(this.sendBatchCallback, Math.max(0, this.periodInMillis - elapsed));
        });
    }
}

new Producer(...process.argv.slice(2));
