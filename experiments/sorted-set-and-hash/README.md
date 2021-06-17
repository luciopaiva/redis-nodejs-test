
# Sorted sets and hashes

This experiment builds on top of the `recently-seen` one, adding more complexity.

In this experiment, we have the role of a producer which will post some items to Redis at a constant rate. These items will each have a key that will hold a hash of a few fields representing the item. Besides that, the producer will also add each item to a sorted set, using as score the current timestamp.

There is also a consumer, which will query the sorted set, looking for items recently updated (say, in the last 3 seconds). For each item returned, the producer will fetch its correspondent key. A Lua script is used so everything can be done in a single consumer call.
