
function obtainDummyPayload(id, sizeInBytes) {
    const buffer = Buffer.allocUnsafe(sizeInBytes);
    buffer.writeUInt32BE(id, 0);
    for (let i = 4; i < buffer.length - 4; i++) {
        buffer[i] = i;
    }
    return buffer;
}

module.exports = {
    obtainDummyPayload,
};
