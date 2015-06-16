#!/usr/bin/env node

'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

var crate, starter, crateB, labB, droneB, laserB

ctx.whenConnected.then(function() {
    return ctx.cmd('resetAccount').delay(1000)
}).then(function() {
    crateB = C.find(ctx.blueprints, { name: 'Space Crate' })
    labB = C.find(ctx.blueprints, { name: 'Basic Labratory' })
    droneB = C.find(ctx.blueprints, { name: 'Drone' })
    laserB = C.find(ctx.blueprints, { tech: 'laser' })

    return ctx.cmd('spawnStarter')
}).then(function() {
    return ctx.wait_for_world({ name: 'Industrial Seed Ship' , account: ctx.account})
}).then(function(result) {
    starter = result

    return C.request("api", 'GET', 200, '/facilities').tap(ctx.logit).
    then(function(facilities) {
        var lab = C.find(facilities, { inventory_id: starter.uuid, blueprint: labB.uuid })

        return Q.all([
            C.request('api', 'POST', 201, '/jobs', {
                blueprint: laserB.uuid, facility: lab.id, action: 'research', slice: 'default',
                parameter: "damage"
            }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
        ])
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
