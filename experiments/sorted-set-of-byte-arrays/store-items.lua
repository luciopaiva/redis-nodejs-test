
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
