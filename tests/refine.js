#!/usr/bin/env node

'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

var starter, refineryB, oreB, metalB, starterB

var npc_account = process.env.NPC_CREDS.split(':')[0]
var npc_client = ctx.customClient({
    AUTH_URL: process.env.ENDPOINT,
    credentials: process.env.NPC_CREDS
})

ctx.whenConnected.then(function() {
    return ctx.cmd('resetAccount').delay(1000)
}).then(function() {
    refineryB = C.find(ctx.blueprints, { name: 'Basic Refinery' })
    oreB = C.find(ctx.blueprints, { name: 'Ore' })
    metalB = C.find(ctx.blueprints, { name: 'Metal' })

    return ctx.cmd('spawnStarter')
}).then(function(result) {
    return ctx.wait_for_world({ uuid: result })
}).then(function(result) {
    starter = result
    starterB = ctx.blueprints[starter.blueprint]

    return ctx.client.request("api", "POST", 204, "/inventory", {
        from_id: starter.uuid, from_slice: 'default',
        to_id: null, to_slice: null,
        items: [{
            blueprint: metalB.uuid, quantity: 500
        }]
    })
}).then(function() {
/*
    var db = require('spacebox-common-native').db_select('api', ctx.logger)

    return db.one('select * from inventories where id = $1', starter.uuid).
    then(function(row) {
        row.doc.usage = row.doc.usage + 10000
        row.doc.contents['default'][oreB.uuid] = 2000

        return db.none('update inventories set doc = $2 where id = $1', [ starter.uuid, row.doc ])
    })
*/

    return npc_client.request("api", "POST", 204, "/inventory", {
        to_id: starter.uuid, to_slice: 'default',
        from_id: null, from_slice: null,
        items: [{
            blueprint: oreB.uuid, quantity: 2
        }]
    })
}).then(function() {
    return ctx.client.request("api", 'GET', 200, '/facilities').
    then(function(facilities) {
        var fac = C.find(facilities, { inventory_id: starter.uuid, blueprint: refineryB.uuid })

        return ctx.client.request('api', 'POST', 201, '/jobs', {
            blueprint: oreB.uuid, facility: fac.id, action: 'refining', slice: 'default',
            quantity: 1
        }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
    })
}).then(function() {
    return ctx.client.request("api", 'GET', 200, '/inventory')
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
