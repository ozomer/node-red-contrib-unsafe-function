# node-red-contrib-unsafe-function
The fast and furious version of function nodes.

Uses [require-from-string](https://www.npmjs.com/package/require-from-string)
instead of executing the function inside a [vm](https://nodejs.org/api/vm.html).

The implementation sticks to the api of the [standard function nodes](http://nodered.org/docs/writing-functions),
so if your code worked on a standard function node it should also work on `unsafe-function` (only faster!).
`unsafe-function` does not run inside a **vm** and therefore may do unsafe operations
(like calling `require('fs')` and its operations).

## Additional Features
`NODE_RED_CONTRIB_UNSAFE_FUNCTION_ASYNC_SEND`, `NODE_RED_CONTRIB_UNSAFE_FUNCTION_ASYNC_RECEIVE` -
Set these environment variables in order to make the sending\receiving of messages asynchronous.
The current behavior of node-red is that sending a message pauses until all the following nodes
in the flow finish handling the sent message (unless they specifically do it asynchronously).
For more information, see [issue 833](https://github.com/node-red/node-red/issues/833).

`NODE_RED_CONTRIB_UNSAFE_FUNCTION_PROFILING`: Set this environment variable to show
for each node a status message with basic profiling information: how many messages
were handled and what's the total\max execution time.
