'use strict';

var Q = require('q'),
    events = require('events'),
    THREE = require('three'),
    th = require('spacebox-common/src/three_helpers.js'),
    C = require('spacebox-common'),
    repl = require("repl"),
    urlUtil = require("url"),
    WebsocketWrapper = require('spacebox-common/src/websockets-wrapper.js')

var position1 = new THREE.Vector3(),
    position2 = new THREE.Vector3()

module.exports = function(ctx) {
    var ws, cmdPromises = [];
    var worldPromises = []
    var jobPromises = {}

    if (process.env.ENDPOINT === undefined ||
        process.env.CREDS === undefined)
        throw new Error("both ENV['ENDPOINT'] and ENV['CREDS'] are required")

    C.configure({
        AUTH_URL: process.env.ENDPOINT,
        credentials: process.env.CREDS
    })
    ctx.account = process.env.CREDS.split(':')[0]

    function cmd(name, opts) {
        console.log(name, opts)

        var rid = ws.cmd(name, opts)

        var deferred = Q.defer()
        cmdPromises.push({ request_id: rid, promise: deferred })

        return deferred.promise
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
                    //console.log(state.values)

                    ctx.world[state.key] = C.deepMerge(state.values, ctx.world[state.key] || {
                        uuid: state.key
                    })

                    var fake = {}
                    fake[state.key] = ctx.world[state.key]
                    worldPromises.forEach(function(pair, i) {
                        var result = pair.fn(fake)
                        if (result !== undefined && result !== false) {
                            pair.promise.resolve(result)
                            worldPromises.splice(i, 1)
                        }
                    })

                    if (state.values.tombstone === true)
                        delete ctx.world[state.key]
                })
                break
            case "result":
                if (data.error === undefined) {
                    console.log(data)
                    ctx.cmdresult = data.result
                }

                cmdPromises.forEach(function(p, i)  {
                    if (data.request_id == p.request_id) {
                        if (data.error !== undefined) {
                            p.promise.reject(data.error)
                        } else {
                            p.promise.resolve(data.result)
                        }

                        cmdPromises.splice(i, 1)
                    }
                })
                break
            default:
                console.log(data)
        }
    }

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

    C.deepMerge({
        logit: function(arg) { ctx.ret  = arg; console.log(arg); return arg },
        closeWebSocket: function() {
            ws.close()
        },
        wait_for_job: function(uuid) {
            var deferred = Q.defer()

            jobPromises[uuid] = deferred

            console.log("waiting for job", uuid)
            return deferred.promise
        },
        wait_for_world: function(opts) {
            console.log("waiting for world", opts)
            return ctx.wait_for_world_fn(function (data) {
                return C.find(data, opts, false)
            })
        },
        wait_for_world_fn: function(fn) {
            var result = fn(ctx.world)

            if (result !== undefined && result !== false) {
                return Q(result)
            } else {
                var deferred = Q.defer()

                worldPromises.push({
                    fn: fn,
                    promise: deferred
                })

                return deferred.promise
            }
        },
        cmd: cmd,
        C: C
    }, ctx)

    // This only works once, but for promise based
    // scripts, that's fine
    var whenConnected = Q.defer()
    ctx.whenConnected = whenConnected.promise

    C.getAuthToken().then(function(token) {
        console.log("authenticated, connecting")

        ws  = WebsocketWrapper.get("3dsim")
        ws.onOpen(function() {
            console.log('reset the world')
            ctx.world = {}

            worldPromises = []
            cmdPromises = []
            jobPromises = {}

            C.getBlueprint.reset()
            C.request('tech', 'GET', 200, '/blueprints').
            then(function(b) {
                ctx.blueprints = b
                console.log("Blueprints loaded")
            }).then(function() {
                whenConnected.resolve()
            }).done()
        })
        ws.on('message', handleMessage)

        WebsocketWrapper.get("tech").on('message', handleTechMessage)
    }).done()

}
