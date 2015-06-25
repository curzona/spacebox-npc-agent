'use strict';

var Q = require('q')
var EventEmitter = require('events').EventEmitter
var THREE = require('three')
var th = require('spacebox-common/src/three_helpers.js')
var C = require('spacebox-common')
var repl = require("repl")
var urlUtil = require("url")

var position1 = new THREE.Vector3()
var position2 = new THREE.Vector3()

var logger = C.logging.create('agent')

module.exports = function(ctx) {
    var ws
    var worldPromises = []
    var jobPromises = {}

    if (process.env.ENDPOINT === undefined ||
        process.env.CREDS === undefined)
        throw new Error("both ENV['ENDPOINT'] and ENV['CREDS'] are required")

    var clientLibFn = require('./client')
    function buildClient(config) {
        return clientLibFn(logger, config)
    }
    
    var client = buildClient({
        AUTH_URL: process.env.ENDPOINT,
        credentials: process.env.CREDS
    })

    var events = ctx.events = new EventEmitter()
    ctx.agent_id = process.env.CREDS.split(':')[0]
    ctx.client = client
    ctx.customClient = buildClient
    ctx.logger= logger

    C.deepMerge({
        cmd: function(name, opts) {
            if (typeof opts !== 'object')
                opts = {}

            opts.wait_ts = ctx.currentTick

            return client.cmd(name, opts)
        },
        logit: function(arg) {
            ctx.ret  = arg

            if (process.env.STDOUT_LOG_LEVEL !== 'trace')
                console.log(arg)

            return arg
        },
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
    }, ctx)

    // This only works once, but for promise based
    // scripts, that's fine
    var whenConnected = Q.defer()
    ctx.whenConnected = whenConnected.promise

    ws = client.getWebsocket()
    ws.onOpen(function() {
        logger.info('reset the world')
        ctx.world = {}

        worldPromises = []
        jobPromises = {}

        client.getBlueprint.reset()
        client.request('api', 'GET', 200, '/blueprints').
        then(function(b) {
            ctx.blueprints = b
            logger.debug("Blueprints loaded")
        }).then(function() {
            whenConnected.resolve()
        }).done()
    })

    ws.on('message', function handleMessage(e) {
        var data

        try {
            data = JSON.parse(e.data)
        } catch (error) {
            logger.error({ err: error, text: e.data }, 'invalid json')
            return
        }

        logger.trace({ data: data }, 'recived message')

        switch (data.type) {
            case "job":

                events.emit('job', data)

                if (data.state == 'delivered') {
                    var p = jobPromises[data.uuid]
                    if (p !== undefined) {
                        delete jobPromises[data.uuid]
                        p.resolve(data)
                    }
                }
                break;
            case "resources":
                events.emit('resources', data)
                break;
            case "state":
                ctx.currentTick = data.timestamp
                data.state.forEach(function(state) {

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
                ctx.result = data.result
                break
        }
    })
}
