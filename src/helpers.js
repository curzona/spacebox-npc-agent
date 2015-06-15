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

C.logging.configure('agents')
var logger = C.logging.create()

module.exports = function(ctx) {
    var ws
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
        logger.info({ cmd: name }, 'sending command')
        logger.trace({ cmd: name, opts: opts }, 'command arguments')

        return C.request('api', 'POST', 200, '/commands/'+name, opts).
        then(function(data) {
            return data.result
        })
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
                    logger.trace({state: state.values}, 'received.state')

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
            case 'result':
                console.log(data)
                ctx.result = data.result
                break
            default:
                logger.warn({ data: data }, 'received.unknown.data')
        }
    }

    function handleTechMessage(e) {
        var data

        try {
            data = JSON.parse(e.data)
        } catch (error) {
            logger.error({ err: error, msg: e }, 'invalid json')
            return
        }

        logger.trace({ data: data }, 'recived tech message')

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
        logger: logger,
        logit: function(arg) { ctx.ret  = arg; logger.debug({ result: arg }); return arg },
        getWebSocket: function() { return ws }, // because it's async
        closeWebSocket: function() {
            ws.close()
        },
        wait_for_job: function(uuid) {
            var deferred = Q.defer()

            jobPromises[uuid] = deferred

            logger.info({ uuid: uuid}, "waiting for job")

            return deferred.promise
        },
        wait_for_world: function(opts) {
            logger.info(opts, "waiting for world")

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
        logger.info("authenticated, connecting")

        ws  = WebsocketWrapper.get("3dsim")
        ws.onOpen(function() {
            logger.info('reset the world')
            ctx.world = {}

            worldPromises = []
            jobPromises = {}

            C.getBlueprint.reset()
            C.request('api', 'GET', 200, '/blueprints').
            then(function(b) {
                ctx.blueprints = b
                logger.debug("Blueprints loaded")
            }).then(function() {
                whenConnected.resolve()
            }).done()
        })
        ws.on('message', handleMessage)

        WebsocketWrapper.get("api").on('message', handleTechMessage)
    }).done()

}
