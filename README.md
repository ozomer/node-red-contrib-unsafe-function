# node-red-contrib-unsafe-function
The fast and furious version of function nodes.

Uses [require-from-string](https://www.npmjs.com/package/require-from-string)
instead of executing the function inside a [vm](https://nodejs.org/api/vm.html).

The implementation sticks to the api of the [standard function nodes](http://nodered.org/docs/writing-functions),
so if your code worked on a standard function node it should also work on `unsafe-function` (only faster!).
`unsafe-function` does not run inside a **vm** and therefore may do unsafe operations
(like calling `require('fs')` and its operations).
