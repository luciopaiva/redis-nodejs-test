
const redis = require("redis");
const clientConfig = require("./config.json");

class ExistsConsumer {
    id = 50;
    client;

    constructor(id = this.id) {
        this.id = id;

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

        this.client.exists(this.id, (err, res) => {
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

new ExistsConsumer(...process.argv.slice(2));
