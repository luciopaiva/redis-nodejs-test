--[[
This script expects no keys and a series of generic arguments in the form:nowInMillis

<timestamp> <K keys> <K values>

Where <timestamp> will be used to score values added to the latest-ids sorted set. The reason keys are not being passed as proper keys arguments is because of a hack to prevent Redis from failing due to cross-slot complaints, since hash tags are not being used in this example and keys will fataly hash into different slots.

It is important to mention that Redis prevents multi-slot operations even when all slots hash into the same node (for example, you can still see `CROSSSLOT Keys in request don't hash to the same slot` errors even in single shard mode!). That's mainly to prevent [slot migration issues](https://github.com/redis/redis/issues/5118).

Reference: https://redis.io/topics/cluster-spec#implemented-subset
--]]

if (#ARGV == 0 or #ARGV % 2 ~= 1) then
    return
end

local count = (#ARGV - 1)  / 2
local nowInMillis = ARGV[1]

local done = 0

for i = 1, count do
    local key = ARGV[i + 1]
    local value = ARGV[i + count + 1]

    redis.call("setex", key, 3, value)
    redis.call("zadd", "latest-ids", nowInMillis, value)

    done = done + 1
end

return done
