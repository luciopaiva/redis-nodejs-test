
local key = KEYS[1]
local now = ARGV[1]
local value = ARGV[2]

redis.call("setex", key, 3, value)
redis.call("zadd", "latest-ids", now, value)

return 1
