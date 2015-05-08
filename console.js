#!/usr/bin/env node

'use strict';

var WebSocket = require('ws'),
    repl = require("repl"),
    urlUtil = require("url"),
    C = require('spacebox-common'),
    WebsocketWrapper = require('spacebox-common/src/websockets-wrapper.js')

C.configure({
    AUTH_URL: process.env.AUTH_URL,
    credentials: process.env.INTERNAL_CREDS,
})

var common_setup = require('./src/common_setup.js')

var ws, ctx;

function cmd(name, opts) {
    if (opts === undefined) {
        opts = {}
    }

    opts.command = name
    console.log(opts)

    ws.connection.send(JSON.stringify(opts))
}

function handleMessage(e) {
    var data

    try {
        data = JSON.parse(e.data)
    } catch (error) {
        console.log(error)
        console.log("invalid json: %s", e.data)
        return
    }

    switch (data.type) {
        case "state":
            ctx.world[data.state.key] = C.deepMerge(data.state.values, ctx.world[data.state.key] || {
                uuid: data.state.key
            })
            console.log("updated", data.state.key)
            break
        default:
            console.log(data)
            break
    }
}

C.getAuthToken().then(function(token) {
    console.log("authenticated, connecting")

    ws  = WebsocketWrapper.get("3dsim", '/', { token: token })
    ws.onOpen(function() {
        console.log('reset the world')
        ctx.world = {}
    })
    ws.on('message', handleMessage)
}).done()

var r = repl.start({})
ctx = r.context

r.on('exit', function () {
    console.log("closing")
    ws.close()
    process.exit()
})

C.deepMerge({
    logit: function(arg) { r.context.ret  = arg; console.log(arg); return arg },
    cmd: cmd,
    C: C
}, r.context)

common_setup(ctx)

C.getBlueprints().then(function(b) {
    ctx.blueprints = b
    console.log("Blueprints loaded")
})


