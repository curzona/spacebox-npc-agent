#!/usr/bin/env node

'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

var droneB, starter

ctx.whenConnected.then(function() {
    droneB = C.find(ctx.blueprints, { name: 'Drone' })

    return ctx.cmd('spawnStarter')
}).then(function() {
    return ctx.wait_for_world({ name: 'Industrial Seed Ship' , account: ctx.account})
}).then(function(result) {
    starter = result

    var npc_account = process.env.NPC_CREDS.split(':')[0]
    return ctx.cmd('spawn', {
        blueprint: droneB.uuid,
        account: npc_account,
        position: { x: 0, y: 0, z: 0 },
        solar_system: starter.solar_system
    }, {
        credentials: process.env.NPC_CREDS
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
