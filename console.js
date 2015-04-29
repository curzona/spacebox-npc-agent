#!/usr/bin/env node

'use strict';

var WebSocket = require('ws'),
    repl = require("repl"),
    urlUtil = require("url"),
    C = require('spacebox-common'),
    WebsocketWrapper = require('spacebox-common/src/websockets-wrapper.js');


var ws, world = {};

function cmd(name, opts) {
    if (opts === undefined) {
        opts = {};
    }

    opts.command = name;
    console.log(opts);

    ws.connection.send(JSON.stringify(opts));
}

function handleMessage(e) {
    var data;

    try {
        data = JSON.parse(e.data);
    } catch (error) {
        console.log(error);
        console.log("invalid json: %s", e.data);
        return;
    }

    switch (data.type) {
        case "state":
            world[data.state.key] = C.deepMerge(data.state.values, world[data.state.key] || {});
            console.log("updated", data.state.key);
            break;
        default:
            console.log(data);
            break;
    }
}

C.getAuthToken().then(function(token) {
    console.log("authenticated, connecting");

    ws  = WebsocketWrapper.get("3dsim", '/', { token: token });
    ws.on('message', handleMessage);
}).done();

var r = repl.start({});

r.on('exit', function () {
    console.log("closing");
    ws.close();
    process.exit();
});

C.deepMerge({
    logit: function(arg) { console.log(arg); },
    cmd: cmd,
    world: world,
    C: C
}, r.context);

C.getBlueprints().then(function(b) {
    r.context.blueprints = b;
    console.log("Blueprints loaded");
});


