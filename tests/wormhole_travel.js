#!/usr/bin/env node

'use strict';

var Q = require('q')
var C = require('spacebox-common')
var THREE = require('three')
var th = require('spacebox-common/src/three_helpers.js')

var ctx = {}
require('../src/helpers')(ctx)

var crate, starter, crateB, labB, droneB, laserB

var position1 = new THREE.Vector3()
var position2 = new THREE.Vector3()

ctx.whenConnected.then(function() {
    return ctx.cmd('resetAgent').delay(1000)
}).then(function() {
    return ctx.cmd('spawnStarter')
}).then(function(result) {
    return ctx.wait_for_world({ uuid: result})
}).then(function(result) {
    starter = result

    // We won't be able to see the wormhole so we just
    // have to delay until the api sees it
    return ctx.cmd("scanWormholes", { vessel: starter.uuid }).delay(1000)
}).then(function(result) {
    var wormhole = result[0]
    th.buildVector(position2, wormhole.position)

    // FIXME move_to is currently broken or we would use that
    // FIXME this is totally broken that I can move towards something
    // that I only know the uuid of and can't see
    return ctx.cmd('orbit', { vessel: starter.uuid, target: wormhole.uuid, radius: 3 }).
    tap(function() {
        return ctx.wait_for_world_fn(function(data) {
            var ship = data[starter.uuid]
            if (ship !== undefined) {
                th.buildVector(position1, ship.position)
                return (position1.distanceTo(position2) < 5)
            }
        })
    }).then(function() {
        return ctx.cmd("jumpWormhole", { vessel: starter.uuid, wormhole: wormhole.uuid })
    })
}).then(function() {
    console.log('Done, you may Cntl-C at any time unless you are waiting')
}).fail(function(e) {
    if (e !== undefined && e.stacktrace !== undefined) {
        console.log(e.stacktrace)
    } else {
        console.log(e)
    }

    process.exit()
}).done()
