'use strict';

var Q = require('q'),
    C = require('spacebox-common')


module.exports = function(ctx) {
    ctx.drone_laser_test = function() {
        var crate, drone_id,
            starter = C.find(ctx.world, { name: 'Industrial Seed Ship', account: ctx.account }, false),
            crateB = C.find(ctx.blueprints, { name: 'Space Crate' }),
            factoryB = C.find(ctx.blueprints, { name: 'Basic Factory' }),
            shipyardB = C.find(ctx.blueprints, { "name": "Drone Maintenance Bay" }),
            metalB = C.find(ctx.blueprints, { name: 'Metal' }),
            droneB = C.find(ctx.blueprints, { name: 'Drone' }),
            laserB = C.find(ctx.blueprints, { name: 'Drone Laser' })

        Q.fcall(function() {
            if (starter === undefined)
                ctx.cmd('spawnStarter')
        }).then(function() {
            return ctx.wait_for_world({ name: 'Industrial Seed Ship' , account: ctx.account})
        }).then(function(result) {
            starter = result

            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var factory = C.find(facilities, { inventory_id: starter.uuid, blueprint: factoryB.uuid })

                return Q.all([
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: crateB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: droneB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: laserB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
                ])
            })
        }).then(function() {
            ctx.cmd('deploy', { blueprint: crateB.uuid, container_id: starter.uuid, slice: 'default', })
        }).then(function() {
            return ctx.wait_for_world({ name: 'Space Crate' , account: ctx.account})
        }).then(function(result) {
            crate = result
            console.log(ctx.world)
        }).then(function() {
            return C.request("tech", 'POST', 200, '/items', {
                inventory: starter.uuid, slice: 'default', blueprint: droneB.uuid
            }).tap(ctx.logit).then(function(doc) {
                drone_id = doc.uuid

                return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                    var factory = C.find(facilities, { inventory_id: starter.uuid, blueprint: shipyardB.uuid })

                    return Q.all([
                        C.request('tech', 'POST', 201, '/jobs', {
                            facility: factory.id, action: 'refitting', slice: 'default', target: drone_id,
                            modules: [ laserB.uuid ]
                        }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
                    ])
                })
            })
        }).then(function() {
            ctx.cmd('deploy', { vessel_uuid: drone_id, blueprint: droneB.uuid,  container_id: starter.uuid, slice: 'default' })
        }).then(function() {
            return ctx.wait_for_world({ uuid: drone_id })
        }).then(function() {
            ctx.cmd('shoot', {
                subject: drone_id,
                target: crate.uuid,
            });
        }).then(function() {
            console.log("---DONE---")
        }).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }

    ctx.construction_test = function() {
        var crate,
            starter = C.find(ctx.world, { name: 'Industrial Seed Ship', account: ctx.account }, false),
            crateB = C.find(ctx.blueprints, { name: 'Space Crate' }),
            factoryB = C.find(ctx.blueprints, { name: 'Basic Factory' }),
            metalB = C.find(ctx.blueprints, { name: 'Metal' })

        Q.fcall(function() {
            if (starter === undefined)
                ctx.cmd('spawnStarter')
        }).then(function() {
            return ctx.wait_for_world({ name: 'Industrial Seed Ship' , account: ctx.account})
        }).then(function(result) {
            starter = result

            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var factory = C.find(facilities, { inventory_id: starter.uuid, blueprint: factoryB.uuid })

                return Q.all([
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: crateB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) }),
                    C.request('tech', 'POST', 201, '/jobs', { blueprint: factoryB.uuid, facility: factory.id, action: 'manufacturing', quantity: 1, slice: 'default' }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
                ])
            })
        }).then(function() {
            ctx.cmd('deploy', { blueprint: crateB.uuid, container_id: starter.uuid, slice: 'default', })
        }).then(function() {
            return ctx.wait_for_world({ name: 'Space Crate' , account: ctx.account})
        }).then(function(result) {
            crate = result
            console.log(ctx.world)

            ctx.cmd('dock', { vessel_uuid: starter.uuid, inventory: crate.uuid, slice: 'default' })
        }).then(function() {
            return ctx.wait_for_world({ uuid: starter.uuid , tombstone: true })
        }).then(function() {

            return C.request("tech", "POST", 204, "/inventory", {
                from_id: starter.uuid, from_slice: 'default',
                to_id: crate.uuid, to_slice: 'default',
                items: [{
                    blueprint: metalB.uuid, quantity: 5
                }, {
                    blueprint: factoryB.uuid, quantity: 1
                }]
            }).then(ctx.logit)
        }).then(function(result) {
            starter = result

            return C.request("tech", 'GET', 200, '/facilities').tap(ctx.logit).then(function(facilities) {
                var facility = C.find(facilities, { inventory_id: crate.uuid, blueprint: crateB.uuid })

                return C.request('tech', 'POST', 201, '/jobs', {
                    blueprint: crateB.uuid, facility: facility.id, action: 'construction', quantity: 1, slice: 'default',
                    modules: [ factoryB.uuid ]
                }).then(function(resp) { return ctx.wait_for_job(resp.job.uuid) })
            })
        }).then(function() {
            console.log("---DONE---")
        }).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }

    ctx.scanning = function() {
        var starter = C.find(ctx.world, { name: 'Industrial Seed Ship', account: ctx.account }, false)

        Q.fcall(function() {
            if (starter === undefined)
                ctx.cmd('spawnStarter')
        }).delay(1000).then(function() {
            starter = C.find(ctx.world, { name: 'Industrial Seed Ship', account: ctx.account })
            ctx.cmd("scanWormholes", { vessel: starter.uuid })
        }).delay(1000).then(function() {
            var wormhole = C.find(ctx.world, { type: 'wormhole' })
            ctx.cmd("jumpWormhole", { vessel: starter.uuid, wormhole: wormhole.uuid })
        }).delay(1000).then(function() {
            var wormhole = C.find(ctx.world, { type: 'wormhole' })
            ctx.cmd("jumpWormhole", { vessel: starter.uuid, wormhole: wormhole.uuid })
        }).then(function() {
            console.log("---DONE---")
        }).delay(1000).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }

    ctx.old_basic_setup = function() {
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
            ctx.cmd('deploy', { vessel_uuid: starter.uuid, blueprint: starter.blueprint, container_id: scaffold.uuid, slice: 'default' })
        }).then(function() {
            return ctx.wait_for_world({ uuid: starter.uuid })
        }).then(function() {
            console.log("---DONE---")
        }).fail(function(e) {
            console.log(e)
            console.log(e.stacktrace)
        }).done()
    }
}
