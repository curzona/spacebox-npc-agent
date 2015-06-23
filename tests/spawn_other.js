#!/usr/bin/env node

'use strict';

var Q = require('q'),
    async = require('async-q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

var droneB, starter

ctx.whenConnected.then(function() {
    starter = ctx.world[Object.keys(ctx.world)[0]]
    droneB = C.find(ctx.blueprints, { name: 'Drone' })
}).then(function() {
    return ctx.cmd('spawn', {
        blueprint: droneB.uuid,
        agent_id: ctx.agent_id,
        position: { x: 10, y: 10, z: 10 },
        solar_system: starter.solar_system
    }).then(function(uuid) {
        return ctx.wait_for_world({ uuid: uuid })
    }).then(function(result) {
        return ctx.cmd('orbit', { vessel: result.uuid, target: starter.uuid })
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
