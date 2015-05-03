'use strict';

var Q = require('q'),
    C = require('spacebox-common');


module.exports = function(ctx) {

    ctx.basic_setup = function() {
        var starter, scaffold,
            scaffoldB = C.find(ctx.blueprints, { name: 'Basic Scaffold' }),
            metalB = C.find(ctx.blueprints, { name: 'Metal' });

        Q.fcall(function() {
            ctx.cmd('spawnStarter');
        }).delay(1000).then(function() {
            starter = C.find(ctx.world, { name: 'Starter Ship' });

            return Q.all([
                C.request('build', 'POST', 201, '/jobs', { blueprint: scaffoldB.uuid, facility: starter.uuid, action: 'manufacture', quantity: 1, slice: 'default' }).then(ctx.logit),
                C.request('build', 'POST', 201, '/jobs', { blueprint: 'd9c166f0-3c6d-11e4-801e-d5aa4697630f', facility: starter.uuid, action: 'manufacture', quantity: 1, slice: 'default' }).then(ctx.logit), // factory
                C.request('build', 'POST', 201, '/jobs', { blueprint: '33e24278-4d46-4146-946e-58a449d5afae', facility: starter.uuid, action: 'manufacture', quantity: 1, slice: 'default' }).then(ctx.logit), // ore mine
            ])
        }).delay(10000).then(function() {
            ctx.cmd('deploy', { shipID: starter.uuid, slice: 'default', blueprint: scaffoldB.uuid });
        }).delay(2000).then(function() {
            scaffold = C.find(ctx.world, { name: 'Basic Scaffold' });

            return C.request("inventory", "POST", 204, "/inventory", [ { inventory: starter.uuid, slice: 'default', blueprint: metalB.uuid, quantity: -2 }, { inventory: scaffold.uuid, slice: 'default', blueprint: metalB.uuid, quantity: 2 } ]).then(ctx.logit);
        }).then(function() {
            return C.request('build', 'POST', 201, '/jobs', { blueprint: '2424c151-645a-40d2-8601-d2f82b2cf4b8', facility: scaffold.uuid, action: 'construct', quantity: 1, slice: 'default' }).then(ctx.logit); // outpost
        }).delay(5000).fail(function(e) {
            console.log(e);
            console.log(e.stacktrace);
        }).done();
    };
};
