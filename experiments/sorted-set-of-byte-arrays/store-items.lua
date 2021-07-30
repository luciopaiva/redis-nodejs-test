
local count = math.min(#KEYS, #ARGV - 1)
local nowInMillis = ARGV[1]

local done = 0

for i = 1, count do
    local key = KEYS[i]
    local value = ARGV[i + 1]

    redis.call("setex", key, 3, value)
    redis.call("zadd", "latest-ids", nowInMillis, value)

    done = done + 1
end

return done
