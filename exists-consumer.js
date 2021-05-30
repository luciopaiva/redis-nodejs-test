
const redis = require("redis");
const clientConfig = require("./client-config.json");

class ExistsConsumer {
    client;

    constructor() {
        this.checkIfExistsCallback = this.checkIfExists.bind(this);

        this.client = redis.createClient(clientConfig);
        this.client.on("error", error => console.error(error));
        this.client.on("connect", () => console.info("Connected"));
        this.client.on("ready", this.start.bind(this));
    }

    start() {
        console.info("Connection ready. Starting job...");
        this.checkIfExists();
    }

    checkIfExists() {
        const startTime = performance.now();

        this.client.exists(50, (err, res) => {
            if (err) {
                console.error(err);
            } else {
                console.info(res === 1 ? "Exists" : "Does not exist");
            }

            const elapsed = Math.round(performance.now() - startTime);
            console.info(`Elapsed: ${elapsed} ms`);
            setTimeout(this.checkIfExistsCallback, Math.max(0, 1000 - elapsed));
        });
    }
}

new ExistsConsumer();
