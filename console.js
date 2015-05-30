#!/usr/bin/env node

'use strict';

if (process.argv[3] === undefined) {
    console.log("Usage: console.js ENDPOINT ACCOUNT_ID:SECRET\nExample: console.js http://localhost:5200 6ab4433b-90cd-4a76-9eb0-be0be7c1646b:a213296a-3f8b-4015-aa97-f8ec6cd90f5b")
    process.exit(1)
}

var WebSocket = require('ws'),
    repl = require("repl"),
    urlUtil = require("url"),
    Q = require('q'),
    C = require('spacebox-common'),
    WebsocketWrapper = require('spacebox-common/src/websockets-wrapper.js')

C.configure({
    AUTH_URL: process.argv[2],
    credentials: process.argv[3]
})

var common_setup = require('./src/common_setup.js')

var ws, ctx;

function cmd(name, opts) {
    ws.cmd(name, opts)
}

var worldPromises = []
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
                ctx.world[state.key] = C.deepMerge(state.values, ctx.world[state.key] || {
                    uuid: state.key
                })

                var fake = {}
                fake[state.key] = ctx.world[state.key]
                worldPromises.forEach(function(pair, i) {
                    var result = C.find(fake, pair.query, false)
                    if (result !== undefined ) {
                        pair.promise.resolve(result)
                        worldPromises.splice(i, 1)
                    }
                })

                console.log("updated", state.key)

                if (state.values.tombstone === true)
                    delete ctx.world[state.key]
            })
            break
        default:
            console.log(data)
            break
    }
}

var jobPromises = {}
function handleTechMessage(e) {
    var data

    try {
        data = JSON.parse(e.data)
    } catch (error) {
        console.log(error)
        console.log("invalid json: %s", e.data)
        return
    }

    console.log(data)

    switch (data.type) {
        case "job":
            if (data.state == 'delivered') {
                var p = jobPromises[data.uuid]
                if (p !== undefined) {
                    delete jobPromises[data.uuid]
                    p.resolve(data)
                }
            }
            break;
    }
}

C.getAuthToken().then(function(token) {
    console.log("authenticated, connecting")

    ws  = WebsocketWrapper.get("3dsim")
    ws.onOpen(function() {
        console.log('reset the world')
        ctx.world = {}

        C.getBlueprints().then(function(b) {
            ctx.blueprints = b
            console.log("Blueprints loaded")
        })
    })
    ws.on('message', handleMessage)

    WebsocketWrapper.get("tech").on('message', handleTechMessage)
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
    wait_for_job: function(uuid) {
        var deferred = Q.defer()

        jobPromises[uuid] = deferred

        return deferred.promise
    },
    wait_for_world: function(opts) {
        var result = C.find(ctx.world, opts, false)

        if (result !== undefined) {
            return Q(result)
        } else {
            var deferred = Q.defer()

            worldPromises.push({
                query: opts,
                promise: deferred
            })

            return deferred.promise
        }
    },
    cmd: cmd,
    C: C
}, r.context)

common_setup(ctx)

ctx.account = process.argv[3].split(':')[0]
