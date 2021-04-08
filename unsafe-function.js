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
const RED2 = require.main.require('node-red');

module.exports = function (RED) {
  'use strict';
  var util = require('util');
  var requireFromString = require('require-from-string');
  var fs = require('fs');
  var path = require('path');
  var Module = require('module');
  var { spawnSync } = require('child_process');

  function sendResults(node, send, _msgid, msgs, cloneFirstMessage) {
    if (msgs == null) {
      return;
    } else if (!Array.isArray(msgs)) {
      msgs = [msgs];
    }
    var msgCount = 0;
    for (var m = 0; m < msgs.length; m++) {
      if (msgs[m]) {
        if (!Array.isArray(msgs[m])) {
          msgs[m] = [msgs[m]];
        }
        for (var n = 0; n < msgs[m].length; n++) {
          var msg = msgs[m][n];
          if (msg !== null && msg !== undefined) {
            if (
              typeof msg === 'object' &&
              !Buffer.isBuffer(msg) &&
              !Array.isArray(msg)
            ) {
              if (msgCount === 0 && cloneFirstMessage !== false) {
                msgs[m][n] = RED.util.cloneMessage(msgs[m][n]);
                msg = msgs[m][n];
              }
              msg._msgid = _msgid;
              msgCount++;
            } else {
              var type = typeof msg;
              if (type === 'object') {
                type = Buffer.isBuffer(msg)
                  ? 'Buffer'
                  : Array.isArray(msg)
                  ? 'Array'
                  : 'Date';
              }
              node.error(
                RED._('function.error.non-message-returned', { type: type })
              );
            }
          }
        }
      }
    }
    if (msgCount > 0) {
      send(msgs);
    }
  }

  function FunctionNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    node.name = n.name;
    node.func = n.func;

    var functionText =
      'module.exports = function(console, util, Buffer, Date, RED, __node__, context, flow, global, env, setTimeout, clearTimeout, setInterval, clearInterval) { ' +
      ' return function(msg, __send__, __done__) { ' +
      '    var __msgid__ = msg._msgid;' +
      '    var node = {' +
      '      id:__node__.id,' +
      '      type:__node__.type,' +
      '      name:__node__.name,' +
      '      log:__node__.log,' +
      '      error:__node__.error,' +
      '      warn:__node__.warn,' +
      '      debug:__node__.debug,' +
      '      trace:__node__.trace,' +
      '      on:__node__.on,' +
      '      status:__node__.status,' +
      '      send:function(msgs,cloneMsg){ __node__.send(__send__,__msgid__,msgs,cloneMsg);},' +
      '      done:__done__' +
      '    };\n' +
      this.func +
      '\n' +
      ' }' +
      '};';

    node.topic = n.topic;
    node.script = '';
    node.outstandingTimers = [];
    node.outstandingIntervals = [];
    node.clearStatus = false;

    var sandbox = {
      console: console,
      util: util,
      Buffer: Buffer,
      Date: Date,
      RED: {
        util: RED.util,
        // NODE-RED runtime api available in function node
        // https://nodered.org/docs/api/modules/v/1.0/@node-red_runtime.html
        api: RED2.nodes,
      },
      __node__: {
        id: node.id,
        name: node.name,
        type: node.type,
        log: function () {
          node.log.apply(node, arguments);
        },
        error: function () {
          node.error.apply(node, arguments);
        },
        warn: function () {
          node.warn.apply(node, arguments);
        },
        debug: function () {
          node.debug.apply(node, arguments);
        },
        trace: function () {
          node.trace.apply(node, arguments);
        },
        send: function (send, id, msgs, cloneMsg) {
          sendResults(node, send, id, msgs, cloneMsg);
        },
        on: function () {
          if (arguments[0] === 'input') {
            throw new Error(RED._('function.error.inputListener'));
          }
          node.on.apply(node, arguments);
        },
        status: function () {
          node.clearStatus = true;
          node.status.apply(node, arguments);
        },
      },
      context: {
        set: function () {
          node.context().set.apply(node, arguments);
        },
        get: function () {
          return node.context().get.apply(node, arguments);
        },
        keys: function () {
          return node.context().keys.apply(node, arguments);
        },
        get global() {
          return node.context().global;
        },
        get flow() {
          return node.context().flow;
        },
      },
      flow: {
        info: function () {
          var id = RED.workspaces.active();
          var flow = RED.nodes.workspace(id);
          if (!flow) {
            // this is probably a subflow
            flow = RED.nodes.subflow(id);
          }
          return flow;
        },
        set: function () {
          node.context().flow.set.apply(node, arguments);
        },
        get: function () {
          return node.context().flow.get.apply(node, arguments);
        },
        keys: function () {
          return node.context().flow.keys.apply(node, arguments);
        },
      },
      global: {
        set: function () {
          node.context().global.set.apply(node, arguments);
        },
        get: function () {
          return node.context().global.get.apply(node, arguments);
        },
        keys: function () {
          return node.context().global.keys.apply(node, arguments);
        },
      },
      env: {
        get: function (envVar) {
          var flow = node._flow;
          return flow.getSetting(envVar);
        },
      },
      setTimeout: function () {
        var func = arguments[0];
        var timerId;
        arguments[0] = function () {
          sandbox.clearTimeout(timerId);
          try {
            func.apply(node, arguments);
          } catch (err) {
            node.error(err, {});
          }
        };
        timerId = setTimeout.apply(node, arguments);
        node.outstandingTimers.push(timerId);
        return timerId;
      },
      clearTimeout: function (id) {
        clearTimeout(id);
        var index = node.outstandingTimers.indexOf(id);
        if (index > -1) {
          node.outstandingTimers.splice(index, 1);
        }
      },
      setInterval: function () {
        var func = arguments[0];
        var timerId;
        arguments[0] = function () {
          try {
            func.apply(node, arguments);
          } catch (err) {
            node.error(err, {});
          }
        };
        timerId = setInterval.apply(node, arguments);
        node.outstandingIntervals.push(timerId);
        return timerId;
      },
      clearInterval: function (id) {
        clearInterval(id);
        var index = node.outstandingIntervals.indexOf(id);
        if (index > -1) {
          node.outstandingIntervals.splice(index, 1);
        }
      },
    };

    node.script = requireFromString(functionText, '', {
      prependPaths: [path.join(__dirname, 'modules')],
    })(
      sandbox.console,
      sandbox.util,
      sandbox.Buffer,
      sandbox.Date,
      sandbox.RED,
      sandbox.__node__,
      sandbox.context,
      sandbox.flow,
      sandbox.global,
      sandbox.env,
      sandbox.setTimeout,
      sandbox.clearTimeout,
      sandbox.setInterval,
      sandbox.clearInterval
    );

    function setError(msg, done, err) {
      if (typeof err === 'object' && err.hasOwnProperty('stack')) {
        //remove unwanted part
        var index = err.stack.search(
          /\n\s*at ContextifyScript.Script.runInContext/
        );
        err.stack = err.stack
          .slice(0, index)
          .split('\n')
          .slice(0, -1)
          .join('\n');
        var stack = err.stack.split(/\r?\n/);

        //store the error in msg to be used in flows
        msg.error = err;

        var line = 0;
        var errorMessage;
        if (stack.length > 0) {
          while (
            line < stack.length &&
            stack[line].indexOf('ReferenceError') !== 0
          ) {
            line++;
          }

          if (line < stack.length) {
            errorMessage = stack[line];
            var m = /:(\d+):(\d+)$/.exec(stack[line + 1]);
            if (m) {
              var lineno = Number(m[1]) - 1;
              var cha = m[2];
              errorMessage += ' (line ' + lineno + ', col ' + cha + ')';
            }
          }
        }
        if (!errorMessage) {
          errorMessage = err.toString();
        }
        done(errorMessage);
      } else if (typeof err === 'string') {
        done(err);
      } else {
        done(JSON.stringify(err));
      }
    }

    function getModules(dir) {
      var modules = [];
      fs.readdirSync(dir).forEach((file) => {
        modules.push({
          label: file,
          sublabel: 'file',
          icon: 'fa fa-file-text',
          checkbox: false,
        });
      });
      return modules;
    }

    function getPackages() {
      // delete cache to reload the package.json file
      delete require.cache[
        Module._resolveFilename(path.join(__dirname, '../../package.json'))
      ];

      var dep = require('../../package.json').dependencies;
      var packages = [];
      for (var name in dep) {
        // simple filter to exclude in Packages TAB
        // all npm packages that start with node-red-xxx
        // usually these modules are nodes
        // TODO: use a new packages.json instead of using the main one used by NODE-RED
        if (!name.startsWith('node-red')) {
          packages.push({
            label: name,
            sublabel: dep[name],
            icon: 'fa fa-archive',
            checkbox: false,
          });
        }
      }
      return packages;
    }

    node.on('input', function (msg, send, done) {
      try {
        var result = node.script(msg, send, done);
        // sync function has return
        if (result) {
          send(result);
          done();
        }
      } catch (err) {
        setError(msg, done, err);
      }
    });

    node.on('close', function () {
      while (node.outstandingTimers.length > 0) {
        clearTimeout(node.outstandingTimers.pop());
      }
      while (node.outstandingIntervals.length > 0) {
        clearInterval(node.outstandingIntervals.pop());
      }
      if (node.clearStatus) {
        node.status({});
      }
    });

    RED.httpAdmin.post('/unsafe-function/:action', function (req, res) {
      try {
        var dir = path.join(__dirname, 'modules');
        var file = path.join(dir, req.query.name);
        var action = req.params.action;

        switch (action) {
          case 'save':
            var text = decodeURIComponent(req.body.text);
            fs.writeFileSync(file, text);
            // delete cache to get the latest changes
            delete require.cache[Module._resolveFilename(file)];
            res.sendStatus(200);
            break;
          case 'create':
            if (fs.existsSync(file)) res.sendStatus(200);
            else {
              fs.writeFileSync(file, '');
              res.send(getModules(dir));
            }
            break;
          case 'delete':
            fs.unlinkSync(file);
            res.send(getModules(dir));
            break;
        }
      } catch (err) {
        res.sendStatus(500);
        node.error(err);
      }
    });

    RED.httpAdmin.get('/unsafe-function/:action', function (req, res) {
      try {
        var dir = path.join(__dirname, 'modules');
        var action = req.params.action;

        switch (action) {
          case 'file':
            res.type('text/plain').sendFile(req.query.name, {
              root: dir,
              lastModified: false,
              cacheControl: false,
              dotfiles: 'allow',
            });
            break;
          case 'packages':
            res.send(getPackages());
            break;
          case 'modules':
            res.send(getModules(dir));
            break;
          case 'npm':
            var proc = spawnSync(
              'npm',
              [
                req.query.command,
                req.query.package,
                '--silent',
                '--no-audit',
                '--no-update-notifier',
                '--no-progress',
              ],
              { stdio: 'inherit' }
            );

            if (proc.error) {
              console.log(proc);
              res.sendStatus(500);
            } else {
              res.send(getPackages());
            }
            break;
        }
      } catch (err) {
        res.sendStatus(500);
        node.error(err);
      }
    });
  }

  RED.nodes.registerType('unsafe-function', FunctionNode);
  RED.library.register('functions');
};
