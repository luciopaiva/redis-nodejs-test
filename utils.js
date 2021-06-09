
function obtainDummyPayload(sizeInBytes) {
    const buffer = Buffer.allocUnsafe(sizeInBytes);
    for (let i = 0; i < buffer.length; i++) {
        buffer[i] = i;
    }
    return buffer;
}

module.exports = {
    obtainDummyPayload,
};
