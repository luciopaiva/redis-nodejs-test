
This experiment shows how to keep a set of elements recently seen. It uses a sorted set where the `score` is the last time the element was seen. The consumer queries for all the elements seen in the last 3 seconds.

Besides updating the elements regularly, the produces is also in charge of periodically removing expired keys. Since Redis does not have a built-in mechanism for expiring elements in a sorted set, we have to do it on our own.
