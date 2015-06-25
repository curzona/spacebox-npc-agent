#!/usr/bin/env node

'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

var droneB, starter

ctx.whenConnected.then(function() {
    return ctx.cmd('resetAgent').delay(1000)
}).then(function() {
    droneB = C.find(ctx.blueprints, { name: 'Drone' })

    return ctx.cmd('spawnStarter')
}).then(function(result) {
    return ctx.wait_for_world({ uuid: result })
}).then(function(result) {
    starter = result

    var npc_agent_id = process.env.NPC_CREDS.split(':')[0]
    var npc_client = ctx.customClient({
        AUTH_URL: process.env.ENDPOINT,
        credentials: process.env.NPC_CREDS
    })

    return npc_client.cmd('spawn', {
        blueprint: droneB.uuid,
        agent_id: npc_agent_id,
        position: { x: 0, y: 0, z: 0 },
        solar_system: starter.solar_system
    })
}).then(function(uuid) {
    return ctx.wait_for_world({ uuid: uuid })
}).then(function() {
    return ctx.cmd('move_to', { vessel: starter.uuid, target: { x: 20, y: 0, z: 0 } })
}).then(function() {
    // TODO wait for the tombstone on the drone, maybe with a timeout
    console.log('Done, you may Cntl-C at any time unless you are waiting')
}).fail(function(e) {
    if (e !== undefined && e.stacktrace !== undefined) {
        console.log(e.stacktrace)
    } else {
        console.log(e)
    }

    process.exit()
}).done()
