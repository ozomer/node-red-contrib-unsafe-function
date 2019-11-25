/**
 * Edited by Awear Solutions Ltd, 2017.
 *
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
    "use strict";
    var util = require("util");
    var requireFromString =  require('require-from-string');

    function sendResults(node,_msgid,msgs) {
        if (msgs === null) {
            return;
        } else if (!Array.isArray(msgs)) {
            msgs = [msgs];
        }
        var msgCount = 0;
        for (var m=0;m<msgs.length;m++) {
            if (msgs[m]) {
                if (!Array.isArray(msgs[m])) {
                    msgs[m] = [msgs[m]];
                }
                for (var n=0; n < msgs[m].length; n++) {
                    var msg = msgs[m][n];
                    if (msg !== null && msg !== undefined) {
                        if (typeof msg === 'object' && !Buffer.isBuffer(msg) && !Array.isArray(msg)) {
                            msg._msgid = _msgid;
                            msgCount++;
                        } else {
                            var type = typeof msg;
                            if (type === 'object') {
                                type = Buffer.isBuffer(msg)?'Buffer':(Array.isArray(msg)?'Array':'Date');
                            }
                            node.error(RED._("function.error.non-message-returned",{ type: type }))
                        }
                    }
                }
            }
        }
        if (msgCount <= 0) {
          return;
        }
        if (RED.settings.nodeRedContribUnsafeFunctionAsyncSend) {
          // Create empty array of the same length.
          var emptyArray = msgs.map(function() {
            return null;
          });
          msgs.forEach(function(wireMessages, wireIndex) {
            if (!wireMessages) {
              return;
            }
            (Array.isArray(wireMessages)?wireMessages:[wireMessages]).forEach(function(msg) {
              // Fill with a single message.
              var arr = emptyArray.slice();
              arr[wireIndex] = [msg];
              setImmediate(function() {
                try {
                  node.send(arr);
                } catch(err) {
                  var line = 0;
                  var errorMessage;
                  var stack = err.stack.split(/\r?\n/);
                  if (stack.length > 0) {
                    while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
                      line++;
                    }

                    if (line < stack.length) {
                      errorMessage = stack[line];
                      var m = /:(\d+):(\d+)$/.exec(stack[line+1]);
                      if (m) {
                        var lineno = Number(m[1])-1;
                        var cha = m[2];
                        errorMessage += " (line "+lineno+", col "+cha+")";
                      }
                    }
                  }
                  if (!errorMessage) {
                    errorMessage = err.toString();
                  }
                  node.error(errorMessage, msg);
                }
              });
            });
          });
        } else {
          node.send(msgs);
        }
    }

    function FunctionNode(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        this.name = n.name;
        this.func = n.func;
        var functionText = "module.exports = function(util, RED, __node__, context, flow, global, env, setTimeout, clearTimeout, setInterval, clearInterval) { " +
        "  return function(msg) { " +
        "    var __msgid__ = msg._msgid;" +
        "    var node = {" +
        "      id:__node__.id," +
        "      name:__node__.name," +
        "      log:__node__.log," +
        "      error:__node__.error," +
        "      warn:__node__.warn," +
        "      debug:__node__.debug," +
        "      trace:__node__.trace," +
        "      on:__node__.on," +
        "      status:__node__.status," +
        "      send:function(msgs) { __node__.send(__msgid__,msgs);}" +
        "    };\n" +
        this.func + "\n" +
        "  };" +
        "};";

        this.topic = n.topic;
        this.outstandingTimers = [];
        this.outstandingIntervals = [];
        var sandbox = {
            util: util,
            RED: {
                util: RED.util
            },
            __node__: {
                id: node.id,
                name: node.name,
                log: function() {
                    node.log.apply(node, arguments);
                },
                error: function() {
                    node.error.apply(node, arguments);
                },
                warn: function() {
                    node.warn.apply(node, arguments);
                },
                debug: function() {
                    node.debug.apply(node, arguments);
                },
                trace: function() {
                    node.trace.apply(node, arguments);
                },
                send: function(id, msgs) {
                    sendResults(node, id, msgs);
                },
                on: function() {
                    if (arguments[0] === "input") {
                        throw new Error(RED._("function.error.inputListener"));
                    }
                    node.on.apply(node, arguments);
                },
                status: function() {
                    node.status.apply(node, arguments);
                }
            },
            context: {
                set: function() {
                    node.context().set.apply(node,arguments);
                },
                get: function() {
                    return node.context().get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().keys.apply(node,arguments);
                },
                get global() {
                    return node.context().global;
                },
                get flow() {
                    return node.context().flow;
                }
            },
            flow: {
                set: function() {
                    node.context().flow.set.apply(node,arguments);
                },
                get: function() {
                    return node.context().flow.get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().flow.keys.apply(node,arguments);
                }
            },
            global: {
                set: function() {
                    node.context().global.set.apply(node,arguments);
                },
                get: function() {
                    return node.context().global.get.apply(node,arguments);
                },
                keys: function() {
                    return node.context().global.keys.apply(node,arguments);
                }
            },
            env: {
                get: function(envVar) {
                    var flow = node._flow;
                    return flow.getSetting(envVar);
                }
            },
            setTimeout: function () {
                var func = arguments[0];
                var timerId;
                arguments[0] = function() {
                    sandbox.clearTimeout(timerId);
                    try {
                        func.apply(this,arguments);
                    } catch(err) {
                        node.error(err,{});
                    }
                };
                timerId = setTimeout.apply(this,arguments);
                node.outstandingTimers.push(timerId);
                return timerId;
            },
            clearTimeout: function(id) {
                clearTimeout(id);
                var index = node.outstandingTimers.indexOf(id);
                if (index > -1) {
                    node.outstandingTimers.splice(index,1);
                }
            },
            setInterval: function() {
                var func = arguments[0];
                var timerId;
                arguments[0] = function() {
                    try {
                        func.apply(this,arguments);
                    } catch(err) {
                        node.error(err,{});
                    }
                };
                timerId = setInterval.apply(this,arguments);
                node.outstandingIntervals.push(timerId);
                return timerId;
            },
            clearInterval: function(id) {
                clearInterval(id);
                var index = node.outstandingIntervals.indexOf(id);
                if (index > -1) {
                    node.outstandingIntervals.splice(index,1);
                }
            }
        };
        if (util.hasOwnProperty('promisify')) {
            sandbox.setTimeout[util.promisify.custom] = function(after, value) {
                return new Promise(function(resolve, reject) {
                    sandbox.setTimeout(function(){ resolve(value); }, after);
                });
            };
        }

        try {
            this.script = requireFromString(functionText)(sandbox.util, sandbox.RED, sandbox.__node__, sandbox.context, sandbox.flow, sandbox.global, sandbox.env, sandbox.setTimeout, sandbox.clearTimeout, sandbox.setInterval, sandbox.clearInterval);
            if (RED.settings.nodeRedContribUnsafeFunctionAsyncReceive) {
              this.on("input", function(msg) {
                setImmediate(function() {
                  handle(msg);
                });
              });
            } else {
              this.on("input", handle);
            }
            this.on("close", function() {
                while(node.outstandingTimers.length > 0) {
                    clearTimeout(node.outstandingTimers.pop());
                }
                while(node.outstandingIntervals.length > 0) {
                    clearInterval(node.outstandingIntervals.pop());
                }
                this.status({});
            });
        } catch(err) {
            // eg SyntaxError - which v8 doesn't include line number information
            // so we can't do better than this
            this.error(err);
        }

        var profiling = {
          "max": 0,
          "total": 0,
          "count": 0,
          "debounce": null,
          "status_count": -1 // current count in status message
        };
        function handle(msg) {
          try {
            var start = process.hrtime();
            var results = node.script(msg);
            sendResults(node, msg._msgid, results);

            var duration = process.hrtime(start);
            var converted = Math.floor((duration[0] * 1e9 + duration[1])/10000)/100;
            node.metric("duration", msg, converted);
            if (RED.settings.nodeRedContribUnsafeFunctionProfiling) {
              profiling.count += 1;
              profiling.total += (duration[0] * 1e9 + duration[1]) / 1000000;
              profiling.max = Math.max(profiling.max, converted);
              if (!profiling.debounce) {
                profiling.debounce = setInterval(function() {
                  if (profiling.status_count == profiling.count) {
                    // count hasn't changed. stop interval.
                    clearInterval(profiling.debounce);
                    profiling.debounce = null;
                    return;
                  }
                  profiling.status_count = profiling.count;
                  node.status({
                    fill: "yellow",
                    shape: "dot",
                    text: "max: " + profiling.max + ", total: " + (Math.round(profiling.total * 100) / 100) + ", count: " + profiling.count
                  });
                }, 1000); // limited rate for status messages.
              }
            } else if (process.env.NODE_RED_FUNCTION_TIME) {
              node.status({fill:"yellow",shape:"dot",text:""+converted});
            }
          } catch(err) {

            var line = 0;
            var errorMessage;
            var stack = err.stack.split(/\r?\n/);
            if (stack.length > 0) {
              while (line < stack.length && stack[line].indexOf("ReferenceError") !== 0) {
                line++;
              }

              if (line < stack.length) {
                errorMessage = stack[line];
                var m = /:(\d+):(\d+)$/.exec(stack[line+1]);
                if (m) {
                  var lineno = Number(m[1])-1;
                  var cha = m[2];
                  errorMessage += " (line "+lineno+", col "+cha+")";
                }
              }
            }
            if (!errorMessage) {
              errorMessage = err.toString();
            }
            node.error(errorMessage, msg);
          }
        }
    }
    RED.nodes.registerType("unsafe-function",FunctionNode);
    RED.library.register("functions");
};
