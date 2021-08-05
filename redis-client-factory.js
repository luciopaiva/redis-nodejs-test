
const Redis = require("ioredis");

const CONFIG_FILE_NAME = "./config.json";

module.exports = class RedisClientFactory {

    static startClient(handler, configFileName = CONFIG_FILE_NAME) {
        const clientConfig = require(configFileName);

        clientConfig["enableAutoPipelining"] = true;

        const client = new Redis(clientConfig);
        client.on("error", error => console.error(error));
        client.on("connect", () => console.info("client> connected"));
        client.on("ready", () => {
            console.info("client> ready");
            handler.call();
        });

        return client;
    }

    static startClusterClient(handler, configFileName = CONFIG_FILE_NAME) {
        const clientConfig = require(configFileName);
        const client = new Redis.Cluster([clientConfig], {
            scaleReads: "slave",
            enableAutoPipelining: true,
            enableReadyCheck: true,
        });
        client.on("error", error => console.error(error));
        client.on("connect", () => console.info("client> connected"));
        client.on("ready", () => {
            console.info("client> ready");
            handler.call();
        });

        return client;
    }
}
