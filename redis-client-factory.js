
const Redis = require("ioredis");

module.exports = class RedisClientFactory {

    static startClient(handler, configFileName = "./config.json") {
        const clientConfig = require(configFileName);

        const client = new Redis(clientConfig);
        client.on("error", error => console.error(error));
        client.on("connect", () => console.info("client> connected"));
        client.on("ready", () => {
            console.info("client> ready");
            handler.call();
        });

        return client;
    }
}
