
const {promisify} = require("util");
const redis = require("redis");
const client = redis.createClient();

const clientQuit = promisify(client.quit).bind(client);
const clientGet = promisify(client.get).bind(client);
const clientSet = promisify(client.set).bind(client);
const clientSetex = promisify(client.setex).bind(client);

const buffer = Buffer.allocUnsafe(128);
for (let i = 0; i < buffer.length; i++) {
    buffer[i] = i;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.info("Connection ready. Starting job...");

    console.info(await clientSetex(100, 3, buffer));

    redis.print(await clientGet(100));

    await sleep(3000);

    redis.print(await clientGet(100));

    await clientQuit();
    console.info("Disconnected");
}

client.on("error", error => console.error(error));
client.on("connect", () => console.info("Connected"));
client.on("ready", main);
