
# Sorted set of byte arrays

A variant of the `sorted-set-and-hash` experiment.

Again, we have a producer updating a sorted set of items scored by timestamp. This time, however, the item ids refer to byte array values, not Redis hashes.

A client in need of accessing the latest items will have to query the sorted set and then get the actual values by directly accessing the referred keys.

One alternative is to store in the sorted set not the ids of the items, but the item values themselves. Has the benefit of relieving the readers from having to cross-reference the ids from the sorted sets with their Redis keys - the values are now directly stored in the sorted set.

How big is the key lookup CPU cost? This is what this experiment tries to measure.

To change between storing byte arrays vs ids in the sorted set, change the `SORTED_SET_CONTAINS_ACTUAL_VALUE` property in `settings.js`.
