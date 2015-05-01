'use strict';

var Q = require('q'),
    C = require('spacebox-common');


module.exports = function(ctx) {

    ctx.basic_setup = function() {
        var starter, scaffold,
            scaffoldB = C.find(ctx.blueprints, { name: 'Basic Scaffold' }),
            oreMineB = C.find(ctx.blueprints, { name: 'Ore mine' }),
            metalB = C.find(ctx.blueprints, { name: 'Metal' });

        Q.fcall(function() {
            ctx.cmd('spawnStarter');
        }).delay(1000).then(function() {
            starter = C.find(ctx.world, { name: 'Starter Ship' });

            return C.request('build', 'POST', 201, '/jobs', { target: scaffoldB.uuid, facility: starter.uuid, action: 'manufacture', quantity: 2, slice: 'default' }).then(ctx.logit);
        }).delay(10000).then(function() {
            ctx.cmd('deploy', { shipID: starter.uuid, slice: 'default', blueprint: scaffoldB.uuid });
        }).delay(2000).then(function() {
            scaffold = C.find(ctx.world, { name: 'Basic Scaffold' });

            return C.request("inventory", "POST", 204, "/inventory", [ { inventory: starter.uuid, slice: 'default', blueprint: metalB.uuid, quantity: -2 }, { inventory: scaffold.uuid, slice: 'default', blueprint: metalB.uuid, quantity: 2 } ]).then(ctx.logit);
        }).then(function() {
            return C.request('build', 'POST', 201, '/jobs', { target: oreMineB.uuid, facility: scaffold.uuid, action: 'construct', quantity: 1, slice: 'default' }).then(ctx.logit);
        }).delay(5000).fail(function(e) {
            console.log(e);
            console.log(e.stacktrace);
        }).done();
    };
};
