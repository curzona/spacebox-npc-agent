'use strict';

var Q = require('q'),
    C = require('spacebox-common')


module.exports = function(ctx) {

    ctx.basic_setup = function() {
        var scaffold,
            starter = C.find(ctx.world, { name: 'Starter Ship', account: ctx.account }, false),
            scaffoldB = C.find(ctx.blueprints, { name: 'Basic Scaffold' }),
            metalB = C.find(ctx.blueprints, { name: 'Metal' })

        Q.fcall(function() {
            if (starter === undefined)
                ctx.cmd('spawnStarter')
        }).then(function() {
            return ctx.wait_for_world({ name: 'Starter Ship' , account: ctx.account})
        }).then(function(result) {
            starter = result

            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var facility = C.find(facilities, { inventory_id: starter.uuid })

                return Q.all([
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: scaffoldB.uuid, facility: facility.id, action: 'manufacture', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: 'd9c166f0-3c6d-11e4-801e-d5aa4697630f', facility: facility.id, action: 'manufacture', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: '33e24278-4d46-4146-946e-58a449d5afae', facility: facility.id, action: 'manufacture', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
                ])
            })
        }).then(function() {
            ctx.cmd('deploy', { shipID: starter.uuid, slice: 'default', blueprint: scaffoldB.uuid })
        }).then(function() {
            return ctx.wait_for_world({ name: 'Basic Scaffold' , account: ctx.account})
        }).then(function(result) {
            scaffold = result
            console.log(ctx.world)

            ctx.cmd('dock', { ship_uuid: starter.uuid, inventory: scaffold.uuid, slice: 'default' })
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
                return C.request('tech', 'POST', 201, '/jobs', { blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8', facility: facility.id, action: 'construct', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
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
                    blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8', facility: facility.id, action: 'refit', slice: 'default', target: scaffold.uuid,
                    modules: [ 'd9c166f0-3c6d-11e4-801e-d5aa4697630f', '33e24278-4d46-4146-946e-58a449d5afae' ]
                }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
            })
        }).then(function() {
            return C.request("tech", 'GET', 200, '/facilities').then(ctx.logit)
        }).then(function() {
            ctx.cmd('undock', { ship_uuid: starter.uuid })
        }).then(function() {
            return ctx.wait_for_world({ uuid: starter.uuid })
        }).then(function() {
            console.log("---DONE---")
        }).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }

    ctx.destroy_structure = function() {
        var desired_ship = '7abb04d3-7d58-42d8-be93-89eb486a1c67'
        var ship_id, structure = C.find(ctx.world, { name: 'Basic Outpost', account: ctx.acount }, false)

        Q.fcall(function() {
            if (structure === undefined)
                ctx.cmd('spawnStructure', { blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8' })
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
            console.log('post to ships')
            return C.request("tech", "POST", 200, "/ships", { inventory: structure.uuid, slice: 'default', blueprint: desired_ship })
        }).then(function() {
            return C.request("tech", 'GET', 200, '/ships').
            tap(ctx.logit).then(function(d) {
                ship_id = ctx.ret[0].id
            })
        }).then(function() {
            ctx.cmd('undock', { ship_uuid: ship_id })
        }).delay(1000).then(function() {
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

    ctx.deployment = function() {
        var desired_ship = '7abb04d3-7d58-42d8-be93-89eb486a1c67'
        var ship_id, structure = C.find(ctx.world, { name: 'Basic Outpost', account: ctx.account }, false)

        Q.fcall(function() {
            if (structure === undefined)
                ctx.cmd('spawnStructure', { blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8' })
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
            console.log('post to ships')
            return C.request("tech", "POST", 200, "/ships", { inventory: structure.uuid, slice: 'default', blueprint: desired_ship })
        }).then(function() {
            return C.request("tech", 'GET', 200, '/ships').
            tap(ctx.logit).then(function(d) {
                ship_id = ctx.ret[0].id
            })
        }).then(function() {
            ctx.cmd('undock', { ship_uuid: ship_id })
        }).delay(1000).then(function() {
            ctx.cmd('dock', { ship_uuid: ship_id, inventory: structure.uuid, slice: 'default' })
        /*}).delay(1000).then(function() {
            ctx.cmd('undock', { ship_uuid: ship_id })
        }).delay(1000).then(function() {
            ctx.cmd('dock', { ship_uuid: ship_id, inventory: structure.uuid, slice: 'default' }) */
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
            ctx.cmd("scanWormholes", { shipID: starter.uuid })
        }).delay(1000).then(function() {
            var wormhole = C.find(ctx.world, { type: 'wormhole', account: ctx.account })
            ctx.cmd("jumpWormhole", { shipID: starter.uuid, wormhole: wormhole.uuid })
        }).delay(1000).then(function() {
            var wormhole = C.find(ctx.world, { type: 'wormhole', account: ctx.account })
            ctx.cmd("jumpWormhole", { shipID: starter.uuid, wormhole: wormhole.uuid })
        }).delay(1000).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }
}
