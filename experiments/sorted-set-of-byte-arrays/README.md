
# Sorted set of byte arrays

A variant of the `sorted-set-and-hash` experiment.

Again, we have a producer updating a sorted set of items scored by timestamp. This time, however, the item ids refer to byte array values, not Redis hashes.

A client in need of accessing the latest items will have to query the sorted set and then get the actual values by directly accessing the referred keys.

One alternative is to store in the sorted set not the ids of the items, but the item values themselves. Has the benefit of relieving the readers from having to cross-reference the ids from the sorted sets with their Redis keys - the values are now directly stored in the sorted set.

How big is the key lookup CPU cost? This is what this experiment tries to measure.

To change between storing byte arrays vs ids in the sorted set, change the `SORTED_SET_CONTAINS_ACTUAL_VALUE` property in `settings.js`.

## Test results

## Increasing load

Running an Elasticache Redis server with 1 cluster (1 master, 2 replicas). Each node is a r6g.large instance.

Running 4 writer instances, each producing 10k items per second (and no read load):

![img.png](charts/img.png)

```
master CPU: 11%
replicas CPU: 7.5%
```

Now still with 4 writer instances, but each one is producing 50k items, for a total of 200k items/s:

![img_1.png](charts/img_1.png)

```
master CPU: 36%
replicas CPU: 24%
```

6 writer instances, each producing 50k items, for a total of 300k items/s:

![img.png](img.png)

```
master CPU: 50%
replicas CPU: 33%
```

Then I tried 8 writer instances, only to find out 50% CPU from the previous result is actually a bottleneck. The r6g.large has 2 vCPUs. Since Redis is single-threaded, we won't get past 50%.

So I tried other instance types. I wanted to try compute-optimized instances, but Elasticache does not provide them.

### r5 instance type

It is also a memory-optimized instance, but from a previous generation and not a graviton machine.

Here are the results running 4 writers, each producing 10k/s:

```
master CPU: 9.5%
replicas CPU: 7%
```

A tiny bit less CPU than the r6g, but the r5 is a bit more expensive (r6g.large: $0.1008, r5.large: $0.126).

Now with 4 writers, 50k items/s each one:

```
master CPU: 30%
replicas CPU: 22%
```

6 writers, 50k items/s each:

```
master CPU: 44%
replicas CPU: 31%
```

Finally, 8 writers, 50k items/s each:

```
master CPU: 53%
replicas CPU: 37%
```

And here's the bottleneck again.

## Same number of keys, more writers

If we keep the same load w.r.t. the keys updated, how a larger number of writers impacts CPU?

```
Instance type | Writers | Items per sec each | master CPU | replica CPU
r5            | 6       | 50k                | 44         | 31 
r5            | 8       | 37.5k              | 48*        | 35 
```

With 8 writers, the master CPU was very unstable and, although it kept at 48% for some time, it ended up rising to a bit above 50%, so things were not exactly great. 

```
Instance type | Writers | Items per sec each | master CPU | replica CPU
r5            | 5       | 48k                | 42         | 27
r5            | 6       | 40k                | 42         | 28
r5            | 8       | 30k                | 42         | 30
```

## Batch periodicity

If we space batches in time, how is the average CPU time affected?

## Sorted set containing reference vs actual value

By default, the producer writes both the item keys and updates the sorted set with the ids of those items. If instead we write the actual item to the sorted set and avoid writing individual keys, what is the CPU gain?

```
Instance type | Actual value? | Writers | Items per sec each | master CPU | replica CPU
r5            | Yes           | 6       | 50k                | 26         | 20
r5            | No            | 6       | 50k                | 43         | 31 
```

## Lua script vs manually running commands

Is the Lua script more efficient since it doesn't require multiple network roundtrips?

TO DO

## How consumers affect CPU

How does adding consumers affect CPU? If they are reading from replicas, it shouldn't matter at all.

TO DO
