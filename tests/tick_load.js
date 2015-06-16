#!/usr/bin/env node

'use strict';

var Q = require('q'),
    async = require('async-q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

C.stats.defineAll({
    spawnRTT: 'timer',
})

var droneB, starter

ctx.whenConnected.then(function() {
    return ctx.cmd('resetAccount').delay(1000)
}).then(function() {
    droneB = C.find(ctx.blueprints, { name: 'Drone' })

    return ctx.cmd('spawnStarter')
    .then(function(uuid) {
        return ctx.wait_for_world({ uuid: uuid })
    }).then(function(result) {
        starter = result
    })
}).then(function() {
    var list = []
    for (var i=0;i<500;i++) { list.push(i) }

    return async.mapLimit(list, 10, function(i) {
        var timer = C.stats.spawnRTT.start()
        return ctx.cmd('spawn', {
            blueprint: droneB.uuid,
            account: starter.account,
            position: { x: 0, y: 0, z: 0 },
            solar_system: starter.solar_system
        }).then(function(uuid) {
            return ctx.wait_for_world({ uuid: uuid })
        }).then(function(result) {
            timer.end()
            return ctx.cmd('orbit', { vessel: result.uuid, target: starter.uuid })
        })
    })
}).then(function() {
    console.log('Done')
    process.exit()
}).fail(function(e) {
    if (e !== undefined && e.stacktrace !== undefined) {
        console.log(e.stacktrace)
    } else {
        console.log(e)
    }

    process.exit()
}).done()
