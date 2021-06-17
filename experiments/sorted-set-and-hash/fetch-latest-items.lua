
local cutOffTime = ARGV[1]
local ids = redis.call("zrangebyscore", "latest-ids", cutOffTime, "+inf")

local result = {}

table.insert(result, redis.call("zcard", "latest-ids"))

for _, itemId in ipairs(ids) do
    table.insert(result, redis.call("hgetall", itemId))
end

return result
