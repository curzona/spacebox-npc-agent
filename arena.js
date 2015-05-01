#!/usr/bin/env node

'use strict';

var WebSocket = require('ws');

var urlUtil = require("url"),
    Q = require('q'),
    C = require('spacebox-common'),
    qhttp = require("q-io/http"),
    EventEmitter = require('events').EventEmitter,
    WebsocketWrapper = require('spacebox-common/src/websockets-wrapper.js');

var ws;
var clientAuth;
var endpointCache;
var gameReady = Q.defer();
var game = new EventEmitter();

game.world = {};
game.byAccount = {};

C.getAuth().then(function(auth) {
    clientAuth = auth;
    return auth.token;
}).then(function(token) {
    console.log("authenticated, connecting");

    ws  = WebsocketWrapper.get("3dsim", '/', { token: token });
    ws.on('message', handleMessage);
}).done();


function handleMessage(event) {
    var data;

    try {
        data = JSON.parse(event.data);
    } catch (e) {
        console.log("invalid json: %s", event.message);
        return;
    }

    //console.log(message);

    switch (data.type) {
        case "arenaAccount":
            clientAuth = data.account;
            break;
        case "connectionReady":
            game.emit('ready');
            break;
        case "state":
            game.world[data.state.key] = C.deepMerge(data.state.values, game.world[data.state.key]);

            if (game.world[data.state.key].type === 'spaceship') {
                if (game.world[data.state.key].tombstone === true) {
                    var data_account = game.world[data.state.key].account;

                    if (data_account !== undefined && game.byAccount[data_account] !== undefined) {
                        var i = game.byAccount[data_account].indexOf(data.state.key);

                        if (i > -1) {
                            game.byAccount[data_account].splice(i, 1);
                        }
                    } else {
                        console.log("unable to remove from account list " + data.state.key);
                        //console.log(game.world[data.state.key]);
                        //console.log(Object.keys(game.byAccount));
                    }

                    delete game.world[data.state.key];
                } else if (data.state.values.account !== undefined) {
                    if (game.byAccount[data.state.values.account] === undefined) {
                        game.byAccount[data.state.values.account] = [];
                    }

                    if (game.byAccount[data.state.values.account].indexOf(data.state.key) == -1) {
                        game.byAccount[data.state.values.account].push(data.state.key);
                    }
                }
            }

            game.emit('update', data.state);
            break;
    }

}

function cmd(name, opts) {
    if (opts === undefined) {
        opts = {};
    }

    opts.command = name;
    console.log(opts);

    ws.send(JSON.stringify(opts));
}

function autoSpawn() {
    var accountList = [clientAuth.account, "the-other-guy"];
    var byAccount = game.byAccount;

    function spawn(account) {
        function randomAxis() {
            return ((10 * Math.random()) - 5);
        }

        cmd('spawn', {
            account: account,
            blueprint: "6e573ecc-557b-4e05-9f3b-511b2611c474",
            position: {
                x: randomAxis(),
                y: randomAxis(),
                z: randomAxis(),
            }
        });
    }

    // TODO The accountList may not be up to date right away
    accountList.forEach(function(account) {
        if (byAccount[account] === undefined || byAccount[account].length === 0) {
            spawn(account);
            spawn(account);
        } else if (byAccount[account].length < 2) {
            spawn(account);
        }
    });
}

function autoTargetEnemy() {
    /*    cmd('orbit', { subject: key, target: key });
     */

    var accounts = Object.keys(game.byAccount);

    accounts.forEach(function(uuid) {
        game.byAccount[uuid].forEach(function(key) {
            //console.log(key);
            //console.log(Object.keys(game.world));

            if (game.world[key].type == "spaceship") {
                var ship = game.world[key];
                if (ship.weapon.state != 'shoot') {
                    var done = false;
                    accounts.forEach(function(enemy) {
                        if (!done && uuid != enemy && game.byAccount[enemy].length > 0) {
                            cmd('orbit', {
                                subject: key,
                                target: game.byAccount[enemy][0]
                            });
                            cmd('shoot', {
                                subject: key,
                                target: game.byAccount[enemy][0]
                            });
                            done = true;
                        }
                    });

                }
            }
        });
    });
}

game.on('ready', function() {
    console.log("game ready");

    cmd('spawnStructure', {
        blueprint: 'd9c166f0-3c6d-11e4-801e-d5aa4697630f',
        position: {
            x: 5,
            y: 5,
            z: 5
        },
        account: clientAuth.account
    });

    setInterval(autoSpawn, 1000);
    setInterval(autoTargetEnemy, 1000);
});
