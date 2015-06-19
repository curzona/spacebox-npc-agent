#!/usr/bin/env node

'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

var crate, starter, crateB, factoryB, metalB

ctx.whenConnected.then(function() {
    return ctx.cmd('resetAccount').delay(1000)
}).then(function() {
    crateB = C.find(ctx.blueprints, { name: 'Space Crate' })
    factoryB = C.find(ctx.blueprints, { name: 'Basic Factory' })
    metalB = C.find(ctx.blueprints, { name: 'Metal' })

    return ctx.cmd('spawnStarter')
}).then(function() {
    return ctx.wait_for_world({ name: 'Industrial Seed Ship' , account: ctx.account})
}).then(function(result) {
    starter = result

    return ctx.client.request("api", 'GET', 200, '/facilities').then(function(facilities) {
        var factory = C.find(facilities, { inventory_id: starter.uuid, blueprint: factoryB.uuid })

        return Q.all([
            ctx.client.request('api', 'POST', 201, '/jobs', { blueprint: crateB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
            ctx.client.request('api', 'POST', 201, '/jobs', { blueprint: factoryB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
        ])
    })
}).then(function() {
    return ctx.cmd('deploy', { blueprint: crateB.uuid, container_id: starter.uuid, slice: 'default', })
}).then(function() {
    return ctx.wait_for_world({ name: 'Space Crate' , account: ctx.account})
}).then(function(result) {
    crate = result
    console.log(ctx.world)

    return ctx.cmd('dock', { vessel_uuid: starter.uuid, container: crate.uuid, slice: 'default' })
}).then(function() {
    return ctx.wait_for_world({ uuid: starter.uuid , tombstone: true })
}).then(function() {

    return ctx.client.request("api", "POST", 204, "/inventory", {
        from_id: starter.uuid, from_slice: 'default',
        to_id: crate.uuid, to_slice: 'default',
        items: [{
            blueprint: metalB.uuid, quantity: 5
        }, {
            blueprint: factoryB.uuid, quantity: 1
        }]
    })
}).then(function(result) {
    starter = result

    return ctx.client.request("api", 'GET', 200, '/facilities').then(function(facilities) {
        var facility = C.find(facilities, { inventory_id: crate.uuid, blueprint: crateB.uuid })

        return ctx.client.request('api', 'POST', 201, '/jobs', {
            blueprint: crateB.uuid, facility: facility.id, action: 'construction', quantity: 1, slice: 'default',
            modules: [ factoryB.uuid ]
        }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
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
