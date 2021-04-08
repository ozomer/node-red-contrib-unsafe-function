# node-red-contrib-unsafe-function
The fast and furious version of function nodes.

Uses [require-from-string](https://www.npmjs.com/package/require-from-string)
instead of executing the function inside a [vm](https://nodejs.org/api/vm.html).

The implementation sticks to the api of the [standard function nodes](http://nodered.org/docs/writing-functions),
so if your code worked on a standard function node it should also work on `unsafe-function` (only faster!).
`unsafe-function` does not run inside a **vm** and therefore may do unsafe operations
(like calling `require('fs')` and its operations).

## Additional Features
<del>`nodeRedContribUnsafeFunctionAsyncSend`, `nodeRedContribUnsafeFunctionAsyncReceive` -
Set these RED settings variables in order to make the sending\receiving of messages asynchronous.
The current behavior of node-red is that sending a message pauses until all the following nodes
in the flow finish handling the sent message (unless they specifically do it asynchronously).
For more information, see [issue 833](https://github.com/node-red/node-red/issues/833).</del>

<del>`nodeRedContribUnsafeFunctionProfiling`: Set this RED settings variable to show
for each node a status message with basic profiling information: how many messages
were handled and what's the total\max execution time.</del>

## Change Log
### From 0.4.0 to 1.0.0
https://github.com/ozomer/node-red-contrib-unsafe-function/issues/10#issue-852665839
* Updating package dependency `require-from-string` to version 2.0.2.
* Added package dependency `mkdirp` version 1.0.4.

## Change Log
### From 0.3.0 to 0.4.0
* Using global RED settings `nodeRedContribUnsafeFunctionAsyncSend`, `nodeRedContribUnsafeFunctionAsyncReceive`
and `nodeRedContribUnsafeFunctionProfiling`, instead of checking `NODE_RED_CONTRIB_UNSAFE_FUNCTION_ASYNC_SEND`,
`NODE_RED_CONTRIB_UNSAFE_FUNCTION_ASYNC_RECEIVE` and `NODE_RED_CONTRIB_UNSAFE_FUNCTION_PROFILING` environment variables.
* Updating package dependency `require-from-string` to version 1.2.1.
