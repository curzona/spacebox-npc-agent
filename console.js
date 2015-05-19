#!/usr/bin/env node

'use strict';

if (process.argv[3] === undefined) {
    console.log("Usage: console.js ENDPOINT ACCOUNT_ID:SECRET\nExample: console.js http://localhost:5200 6ab4433b-90cd-4a76-9eb0-be0be7c1646b:a213296a-3f8b-4015-aa97-f8ec6cd90f5b")
    process.exit(1)
}

var WebSocket = require('ws'),
    repl = require("repl"),
    urlUtil = require("url"),
    C = require('spacebox-common'),
    WebsocketWrapper = require('spacebox-common/src/websockets-wrapper.js')

WebsocketWrapper.registerPath('3dsim', '/temporary')

C.configure({
    AUTH_URL: process.argv[2],
    credentials: process.argv[3]
})

var common_setup = require('./src/common_setup.js')

var ws, ctx;

function cmd(name, opts) {
    ws.cmd(name, opts)
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
            data.state.forEach(function(state) {
                console.log('received', state)
                if (state.values.tombstone === true) {
                    delete ctx.world[state.key]
                } else {
                    ctx.world[state.key] = C.deepMerge(state.values, ctx.world[state.key] || {
                        uuid: state.key
                    })
                }

                console.log("updated", state.key)
            })
            break
        case "tempAccount":
            console.log("new credentials received", data.auth)
            C.setAuth(data.auth)
            ctx.account = data.auth.account
            break
        default:
            console.log(data)
            break
    }
}

C.getAuthToken().then(function(token) {
    console.log("authenticated, connecting")

    ws  = WebsocketWrapper.get("3dsim")
    ws.onOpen(function() {
        console.log('reset the world')
        ctx.world = {}
    })
    ws.on('message', handleMessage)

    WebsocketWrapper.get("tech").on('message', function(msg) {
        console.log(msg.data)
    })
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


