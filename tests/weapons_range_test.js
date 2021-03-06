#!/usr/bin/env node

'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

var crate, drone_id,
    starter,
    crateB,
    factoryB,
    shipyardB,
    metalB,
    droneB,
    laserB

ctx.whenConnected.then(function() {
    return ctx.cmd('resetAgent').delay(1000)
}).then(function() {
    crateB = C.find(ctx.blueprints, { name: 'Space Crate' })
    factoryB = C.find(ctx.blueprints, { name: 'Basic Factory' })
    shipyardB = C.find(ctx.blueprints, { "name": "Drone Maintenance Bay" })
    metalB = C.find(ctx.blueprints, { name: 'Metal' })
    droneB = C.find(ctx.blueprints, { name: 'Drone' })
    laserB = C.find(ctx.blueprints, { name: 'Drone Laser' })

    return ctx.cmd('spawnStarter')
}).then(function(result) {
    return ctx.wait_for_world({ uuid: result })
}).then(function(result) {
    starter = result

    return ctx.client.request("api", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
        var factory = C.find(facilities, { container_id: starter.uuid, blueprint: factoryB.uuid })

        return Q.all([
            ctx.client.request('api', 'POST', 201, '/jobs', { blueprint: crateB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
            ctx.client.request('api', 'POST', 201, '/jobs', { blueprint: droneB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
            ctx.client.request('api', 'POST', 201, '/jobs', { blueprint: laserB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
        ])
    })
}).then(function() {
    ctx.cmd('deploy', { blueprint: crateB.uuid, container_id: starter.uuid, slice: 'default', })
}).then(function(result) {
    return ctx.wait_for_world({ uuid: result })
}).then(function(result) {
    crate = result
    console.log(ctx.world)
}).then(function() {
    return ctx.client.request("api", 'POST', 200, '/items', {
        container_id: starter.uuid, slice: 'default', blueprint: droneB.uuid
    }).tap(ctx.logit).then(function(doc) {
        drone_id = doc.uuid

        return ctx.client.request("api", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
            var factory = C.find(facilities, { container_id: starter.uuid, blueprint: shipyardB.uuid })

            return Q.all([
                ctx.client.request('api', 'POST', 201, '/jobs', {
                    facility: factory.id, action: 'refitting', slice: 'default', target: drone_id,
                    modules: [ laserB.uuid ]
                }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
            ])
        })
    })
}).then(function() {
    return ctx.cmd('deploy', { vessel_uuid: drone_id, blueprint: droneB.uuid,  container_id: starter.uuid, slice: 'default' })
}).then(function() {
    return ctx.wait_for_world({ uuid: drone_id })
}).then(function() {
    return ctx.cmd('move_to', { vessel: drone_id, target: { x: 20, y: 0, z: 0 } })
}).delay(10000).then(function() {
    return ctx.cmd('shoot', {
        vessel: drone_id,
        target: crate.uuid,
    });

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
