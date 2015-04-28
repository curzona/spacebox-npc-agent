#!/usr/bin/env node

'use strict';

var WebSocket = require('ws'),
    urlUtil = require("url"),
    C = require('spacebox-common');

var repl = require("repl");

var ws, clientAuth, world = {};

function cmd(name, opts) {
    if (opts === undefined) {
        opts = {};
    }

    opts.command = name;
    console.log(opts);

    ws.send(JSON.stringify(opts));
}

function handleMessage(message) {
    var data;

    try {
        data = JSON.parse(message);
    } catch (e) {
        console.log("invalid json: %s", message);
        return;
    }

    switch (data.type) {
        case "arenaAccount":
            clientAuth = data.account;
            break;
        case "state":
            world[data.state.key] = C.deepMerge(data.state.values, world[data.state.key] || {});
            break;
        default:
            console.log(data);
            break;
    }
}

C.getAuthToken().then(function(token) {
    console.log("authenticated, connecting");

    var protocol, url = urlUtil.parse(process.env.SPODB_URL);
    if (url.protocol == 'https:') {
        protocol = 'wss';
    } else {
        protocol = 'ws';
    }
    ws = new WebSocket(protocol + '://' + url.host + '/', {
        headers: {
            "Authorization": 'Bearer ' + token

        }
    });
}).then(function() {
    ws.on('error', function(error) {
        console.log("error: %s", error);
    });

    ws.on('close', function() {
        console.log("lost connection to the game");
        process.exit(1);
    });

    ws.on('message', handleMessage);
}).done();

var r = repl.start({});

r.on('exit', function () {
  console.log("closing");
  ws.close();
  process.exit();
});

C.deepMerge({
    cmd: cmd,
    world: world,
    C: C
}, r.context);

C.getBlueprints().then(function(b) {
    r.context.blueprints = b;
    console.log("Blueprints loaded");
});


