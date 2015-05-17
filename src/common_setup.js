'use strict';

var Q = require('q'),
    C = require('spacebox-common')


module.exports = function(ctx) {
    ctx.deployment = function() {
        var desired_ship = '7abb04d3-7d58-42d8-be93-89eb486a1c67'
        var ship_id, structure = C.find(ctx.world, { name: 'Basic Outpost', }, false)

        Q.fcall(function() {
            if (structure === undefined)
                ctx.cmd('spawnStructure', { blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8' })
        }).delay(1000).then(function() {
            structure = C.find(ctx.world, { name: 'Basic Outpost', })

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
        var starter = C.find(ctx.world, { name: 'Starter Ship' }, false)

        Q.fcall(function() {
            if (starter === undefined)
                ctx.cmd('spawnStarter')
        }).delay(1000).then(function() {
            starter = C.find(ctx.world, { name: 'Starter Ship' })
            ctx.cmd("scanWormholes", { shipID: starter.uuid })
        }).delay(1000).then(function() {
            var wormhole = C.find(ctx.world, { type: 'wormhole' })
            ctx.cmd("jumpWormhole", { shipID: starter.uuid, wormhole: wormhole.uuid })
        }).delay(1000).then(function() {
            var wormhole = C.find(ctx.world, { type: 'wormhole' })
            ctx.cmd("jumpWormhole", { shipID: starter.uuid, wormhole: wormhole.uuid })
        }).delay(1000).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }

    ctx.basic_setup = function() {
        var starter, scaffold,
            scaffoldB = C.find(ctx.blueprints, { name: 'Basic Scaffold' }),
            metalB = C.find(ctx.blueprints, { name: 'Metal' })

        Q.fcall(function() {
            if (starter === undefined)
                ctx.cmd('spawnStarter')
        }).delay(1000).then(function() {
            starter = C.find(ctx.world, { name: 'Starter Ship' })

            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var facility = C.find(facilities, { inventory_id: starter.uuid })

                return Q.all([
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: scaffoldB.uuid, facility: facility.id, action: 'manufacture', quantity: 1, slice: 'default' }).then(ctx.logit),
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: 'd9c166f0-3c6d-11e4-801e-d5aa4697630f', facility: facility.id, action: 'manufacture', quantity: 1, slice: 'default' }).then(ctx.logit), // factory
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: '33e24278-4d46-4146-946e-58a449d5afae', facility: facility.id, action: 'manufacture', quantity: 1, slice: 'default' }).then(ctx.logit), // ore mine
                ])
            })
        }).delay(10000).then(function() {
            ctx.cmd('deploy', { shipID: starter.uuid, slice: 'default', blueprint: scaffoldB.uuid })
        }).delay(2000).then(function() {
            scaffold = C.find(ctx.world, { name: 'Basic Scaffold' })
            console.log(ctx.world)

            return C.request("tech", "POST", 204, "/inventory", {
                from_id: starter.uuid, from_slice: 'default',
                to_id: scaffold.uuid, to_slice: 'default',
                items: [{ blueprint: metalB.uuid, quantity: 2 }]
            }).then(ctx.logit)
        }).then(function() {
        }).then(function() {
            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var facility = C.find(facilities, { inventory_id: scaffold.uuid }) // the scaffold only has one, but things can have multiple facilities
                return C.request('tech', 'POST', 201, '/jobs', { blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8', facility: facility.id, action: 'construct', quantity: 1, slice: 'default' }).then(ctx.logit) // outpost
            })
        }).delay(10000).then(function() {
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
                var facility = C.find(facilities, { inventory_id: scaffold.uuid }) // it's an outpost now

                return C.request('tech', 'POST', 201, '/jobs', {
                    blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8', facility: facility.id, action: 'refit', slice: 'default', target: scaffold.uuid,
                    modules: [ 'd9c166f0-3c6d-11e4-801e-d5aa4697630f', '33e24278-4d46-4146-946e-58a449d5afae' ]
                }).then(ctx.logit) // outpost
            })
        }).delay(2000).then(function() {
            return C.request("tech", 'GET', 200, '/facilities').then(ctx.logit)
        }).then(function() {
            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var facility = C.find(facilities, { inventory_id: scaffold.uuid, blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8' }) // there are multiple now, we need the outpost facility
                return C.request('tech', 'POST', 201, '/jobs', {
                    blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8', facility: facility.id, action: 'refit', slice: 'default', target: scaffold.uuid,
                    modules: [ 'd9c166f0-3c6d-11e4-801e-d5aa4697630f' ]
                }).then(ctx.logit) // outpost
            })
        }).delay(2000).then(function() {
            return C.request("tech", 'GET', 200, '/facilities').then(ctx.logit)
        }).then(function() {
            console.log("---DONE---")
        }).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }
}
