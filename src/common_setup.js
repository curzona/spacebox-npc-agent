'use strict';

var Q = require('q'),
    C = require('spacebox-common')


module.exports = function(ctx) {
    ctx.basic_setup = function() {
        var scaffold,
            starter = C.find(ctx.world, { name: 'Industrial Seed Ship', account: ctx.account }, false),
            crateB = C.find(ctx.blueprints, { name: 'Space Crate' }),
            metalB = C.find(ctx.blueprints, { name: 'Metal' })

        Q.fcall(function() {
            if (starter === undefined)
                ctx.cmd('spawnStarter')
        }).then(function() {
            return ctx.wait_for_world({ name: 'Industrial Seed Ship' , account: ctx.account})
        }).then(function(result) {
            starter = result

            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var facility = C.find(facilities, { inventory_id: starter.uuid, blueprint: "964e7711-9341-429c-866a-73ee5ce34544" })

                return Q.all([
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: crateB.uuid, facility: facility.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: 'd9c166f0-3c6d-11e4-801e-d5aa4697630f', facility: facility.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: '33e24278-4d46-4146-946e-58a449d5afae', facility: facility.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
                ])
            })
        }).then(function() {
            ctx.cmd('deploy', { blueprint: crateB.uuid, container_id: starter.uuid, slice: 'default', })
        }).then(function() {
            return ctx.wait_for_world({ name: 'Basic Scaffold' , account: ctx.account})
        }).then(function(result) {
            scaffold = result
            console.log(ctx.world)

            ctx.cmd('dock', { vessel_uuid: starter.uuid, inventory: scaffold.uuid, slice: 'default' })
        }).then(function() {
            return ctx.wait_for_world({ uuid: starter.uuid , tombstone: true })
        }).then(function() {

            return C.request("tech", "POST", 204, "/inventory", {
                from_id: starter.uuid, from_slice: 'default',
                to_id: scaffold.uuid, to_slice: 'default',
                items: [{ blueprint: metalB.uuid, quantity: 5 }]
            }).then(ctx.logit)
        }).then(function() {
            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var facility = C.find(facilities, { inventory_id: scaffold.uuid }) // the scaffold only has one, but things can have multiple facilities
                return C.request('tech', 'POST', 201, '/jobs', { blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8', facility: facility.id, action: 'construction', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
            })
        }).then(function() {
            return C.request("tech", "POST", 204, "/inventory", {
                from_id: starter.uuid, from_slice: 'default',
                to_id: scaffold.uuid, to_slice: 'default',
                items: [{
                    blueprint: 'd9c166f0-3c6d-11e4-801e-d5aa4697630f', quantity: 1
                }, {
                    blueprint: '33e24278-4d46-4146-946e-58a449d5afae', quantity: 1
                }]
            }).then(ctx.logit)
        }).then(function() {
            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var facility = C.find(facilities, { inventory_id: scaffold.uuid }) // it's an outpost now, but the same uuid

                return C.request('tech', 'POST', 201, '/jobs', {
                    blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8', facility: facility.id, action: 'refitting', slice: 'default', target: scaffold.uuid,
                    modules: [ 'd9c166f0-3c6d-11e4-801e-d5aa4697630f', '33e24278-4d46-4146-946e-58a449d5afae' ]
                }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
            })
        }).then(function() {
            return C.request("tech", 'GET', 200, '/facilities').then(ctx.logit)
        }).then(function() {
            ctx.cmd('deploy', { uuid: starter.uuid, blueprint: starter.blueprint, container_id: scaffold.uuid, slice: 'default' })
        }).then(function() {
            return ctx.wait_for_world({ uuid: starter.uuid })
        }).then(function() {
            console.log("---DONE---")
        }).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }

    ctx.destroy_structure = function(solar_system) {
        var desired_ship = 'c34e95b7-967f-4790-847c-2a43e72277ff'
        var ship_id, structure = C.find(ctx.world, { name: 'Basic Outpost', account: ctx.acount }, false)

        Q.fcall(function() {
            if (structure === undefined)
                ctx.cmd('spawn', { blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8', solar_system: solar_system }) // outpost
        }).delay(1000).then(function() {
            structure = C.find(ctx.world, { name: 'Basic Outpost', account: ctx.account })

            return C.request("tech", "POST", 204, "/inventory", {
                from_id: null, from_slice: null,
                to_id: structure.uuid, to_slice: 'default',
                items: [{
                    blueprint: desired_ship, quantity: 1
                }]
            }).then(ctx.logit)
        }).then(function() {
            ctx.cmd('deploy', { blueprint: desired_ship, container_id: structure.uuid, slice: 'default' })
        }).then(function(body) {
            return ctx.wait_for_world({ blueprint: desired_ship , account: ctx.account})
        }).then(function(result) {
            ship_id = result.uuid

            ctx.cmd('shoot', {
                subject: ship_id,
                target: structure.uuid,
            });
        }).then(function() {
            console.log("---DONE---")
        }).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    
    }

    ctx.scanning = function() {
        var starter = C.find(ctx.world, { name: 'Starter Ship', account: ctx.account }, false)

        Q.fcall(function() {
            if (starter === undefined)
                ctx.cmd('spawnStarter')
        }).delay(1000).then(function() {
            starter = C.find(ctx.world, { name: 'Starter Ship', account: ctx.account })
            ctx.cmd("scanWormholes", { vessel: starter.uuid })
        }).delay(1000).then(function() {
            var wormhole = C.find(ctx.world, { type: 'wormhole', account: ctx.account })
            ctx.cmd("jumpWormhole", { vessel: starter.uuid, wormhole: wormhole.uuid })
        }).delay(1000).then(function() {
            var wormhole = C.find(ctx.world, { type: 'wormhole', account: ctx.account })
            ctx.cmd("jumpWormhole", { vessel: starter.uuid, wormhole: wormhole.uuid })
        }).delay(1000).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }

    ctx.test_code = function() {
        var scaffold,
            starter = C.find(ctx.world, { name: 'Starter Ship', account: ctx.account }, false),
            crateB = C.find(ctx.blueprints, { name: 'Basic Scaffold' }),
            metalB = C.find(ctx.blueprints, { name: 'Metal' })

        Q.fcall(function() {
            if (starter === undefined)
                ctx.cmd('spawnStarter')
        }).then(function() {
            return ctx.wait_for_world({ name: 'Starter Ship' , account: ctx.account})
        }).then(function(result) {
            starter = result

            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var facility = C.find(facilities, { inventory_id: starter.uuid, blueprint: "964e7711-9341-429c-866a-73ee5ce34544" })

                return C.request('tech', 'POST', 201, '/jobs', { blueprint: crateB.uuid, facility: facility.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
            })
        }).then(function() {
            ctx.cmd('deploy', { blueprint: crateB.uuid, container_id: starter.uuid, slice: 'default', })
        }).then(function() {
            return ctx.wait_for_world({ name: 'Basic Scaffold' , account: ctx.account})
        }).then(function(result) {
            scaffold = result
            console.log(ctx.world)

            ctx.cmd('dock', { vessel_uuid: scaffold.uuid, inventory: starter.uuid, slice: 'default' })
        }).then(function() {
            console.log("---DONE---")
        }).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }
}
