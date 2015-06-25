#!/usr/bin/env node

'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

var logger = ctx.logger
var client = ctx.client
var cmd = ctx.cmd
var starter, blueprints, world, facilities, inventory

var idx = { // indexes
    ours: [],
    b: {} // blueprints
}

var personality = {
    min_vessels_for_exploration: 3,
    max_econ_vessels: 2
}

ctx.whenConnected.
then(function() {
    blueprints = ctx.blueprints
    world = ctx.world

    idx.b.starter = C.find(blueprints, { name: "Industrial Seed Ship" })
    idx.b.crate = C.find(blueprints, { name: "Space Crate" })
    idx.b.ore = C.find(blueprints, { name: "Ore" })
    idx.b.metal = C.find(blueprints, { name: "Metal" })

    C.valuesArray(world).
    forEach(function(obj) {
        if (obj.blueprint === idx.b.starter.uuid)
            starter = obj

        if (obj.agent_id == ctx.agent_id)
            idx.ours[obj.uuid] = true

        // TODO bootstrap an index of your vessels, structures, etc
    })

    if (starter === undefined)
        return cmd('spawnStarter').
        then(function(uuid) {
            return ctx.wait_for_world({ uuid: uuid })
        }).then(function(result) {
            starter = result
        })
}).then(function() {
    return client.get('/inventory').
    then(function(data) {
        inventory = data
        idx.inventory = data.reduce(function(acc, row) {
            acc[row.id] = row.doc
            return acc
        }, {})
    })
}).then(function() {
    return client.get('/facilities').
    then(function(data) {
        facilities = data
        idx.facilities = data.reduce(function(acc, row) {
            var types = acc[row.container_id]
            if(!types)
                types = acc[row.container_id] = {}

            var list = types[row.facility_type]
            if (!list)
                list = types[row.facility_type] = []

            list.push(row)

            return acc
        }, {})
    })
}).then(function() {
    GoalOrientedActionPlanning()

    // TODO deal with job failures

    ctx.events.on('job', GoalOrientedActionPlanning)
    ctx.events.on('resources', GoalOrientedActionPlanning)
}).done()

var goals = {
    build: { fn: economy_planner, p: 1.0 },
    explore: { fn: explore_planner, p: 0.0 },
    fight: { fn: fight_planner, p: 0.0 }
}

function GoalOrientedActionPlanning(data) {
    if (idx.ours.length >= personality.min_vessels_for_exploration) {
        goals.build.p = goals.build.p - 0.3
        goals.explore = goals.explore + 0.3
    }

    var event_type

    if (data && data.type)
        event_type = data.type

    switch(event_type) {
        case 'job':
        case 'resources':
            goals.build.fn()
            break;
        default:
            C.valuesArray(goals).forEach(function(goal) {
                goal.fn()
            })
    }
}

function economy_planner() {
    var p = goals.build.p
    /*
     * What can I build?
     *  
     */
    // FIXME obviously they are not all econ vessels
    if (idx.ours.length < personality.max_econ_vessels) {
    
        if (idx.inventory[starter.uuid].contents.default[idx.b.metal.uuid] > idx.b.crate.build.resources[idx.b.metal.uuid]
       ) {
            // Currently we just build and deploy crates
            client.post('/jobs/manufacturing', {
                facility: idx.facilities[starter.uuid].manufacturing[0].id,
                blueprint: idx.b.crate.uuid
            }).then(function(resp) {
                return ctx.wait_for_job(resp.job.uuid)
            }).then(function() {
                return cmd('deploy', {
                    blueprint: idx.b.crate.uuid,
                    container_id: starter.uuid,
                })
            }).done()
       } else {
           // We don't have enough metal for another crate
       }
    }

    inventory.forEach(function(container) {
        if (container.doc.contents.default && container.doc.contents.default[idx.b.ore.uuid] > 0) {
            if (idx.facilities[container.id] && 
                idx.facilities[container.id].refining &&
                idx.facilities[container.id].refining.length > 0) {

                client.post('/jobs/refining', {
                    facility: idx.facilities[starter.uuid].refining[0].id,
                    blueprint: idx.b.ore.uuid,
                    quantity: container.doc.contents.default[idx.b.ore.uuid]
                }).done()
            } else {
                logger.warn({ container_id: container.id }, "ore but no refinery")
            }
        }
    })
}

function explore_planner() {

}

function fight_planner() {

}
