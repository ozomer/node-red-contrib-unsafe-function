/**
 * Edited by Awear Solutions Ltd, 2016.
 *
 * Copyright 2013,2015 IBM Corp.
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
        } else if (!util.isArray(msgs)) {
            msgs = [msgs];
        }
        var msgCount = 0;
        for (var m=0;m<msgs.length;m++) {
            if (msgs[m]) {
                if (util.isArray(msgs[m])) {
                    for (var n=0; n < msgs[m].length; n++) {
                        msgs[m][n]._msgid = _msgid;
                        msgCount++;
                    }
                } else {
                    msgs[m]._msgid = _msgid;
                    msgCount++;
                }
            }
        }
        if (msgCount <= 0) {
          return;
        }
        if (process.env.NODE_RED_CONTRIB_UNSAFE_FUNCTION_ASYNC_SEND) {
          // Create empty array of the same length.
          var emptyArray = msgs.map(function() {
            return null;
          });
          msgs.forEach(function(wireMessages, wireIndex) {
            (util.isArray(wireMessages)?wireMessages:[wireMessages]).forEach(function(msg) {
              // Fill with a single message.
              var arr = emptyArray.slice();
              arr[wireIndex] = [msg];
              setImmediate(function() {
                node.send(arr);
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
        var functionText = "module.exports = function(__node__, context, flow, global, setTimeout, clearTimeout, setInterval, clearInterval) { " +
        "  return function(msg) { " +
        "    var __msgid__ = msg._msgid;" +
        "    var node = {" +
        "      log:__node__.log," +
        "      error:__node__.error," +
        "      warn:__node__.warn," +
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
            __node__: {
                log: function() {
                    node.log.apply(node, arguments);
                },
                error: function() {
                    node.error.apply(node, arguments);
                },
                warn: function() {
                    node.warn.apply(node, arguments);
                },
                send: function(id, msgs) {
                    sendResults(node, id, msgs);
                },
                on: function() {
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
                }
            },
            global: {
                set: function() {
                    node.context().global.set.apply(node,arguments);
                },
                get: function() {
                    return node.context().global.get.apply(node,arguments);
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

        try {
            this.script = requireFromString(functionText)(sandbox.__node__, sandbox.context, sandbox.flow, sandbox.global, sandbox.setTimeout, sandbox.clearTimeout, sandbox.setInterval, sandbox.clearInterval);
            if (process.env.NODE_RED_CONTRIB_UNSAFE_FUNCTION_ASYNC_RECEIVE) {
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
            });
        } catch(err) {
            // eg SyntaxError - which v8 doesn't include line number information
            // so we can't do better than this
            this.error(err);
        }

        var profiling = {
          "max": 0,
          "total": 0,
          "count": 0
        };
        function handle(msg) {
          try {
            var start = process.hrtime();
            var results = node.script(msg);
            sendResults(node, msg._msgid, results);

            var duration = process.hrtime(start);
            var converted = Math.floor((duration[0] * 1e9 + duration[1])/10000)/100;
            node.metric("duration", msg, converted);
            if (process.env.NODE_RED_CONTRIB_UNSAFE_FUNCTION_PROFILING) {
              profiling.count += 1;
              profiling.total += (duration[0] * 1e9 + duration[1]) / 1000000;
              profiling.max = Math.max(profiling.max, converted);
              node.status({
                fill: "yellow",
                shape: "dot",
                text: "max: " + profiling.max + ", total: " + (Math.round(profiling.total * 100) / 100) + ", count: " + profiling.count
              });
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
