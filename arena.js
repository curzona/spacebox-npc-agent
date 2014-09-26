'use strict';

var WebSocket = require('ws');

var urlUtil = require("url");
var Q = require('q');
var qhttp = require("q-io/http");
var deepMerge = require('./deepMerge');
var EventEmitter = require('events').EventEmitter;


var ws;
var clientAuth;
var endpointCache;
var gameReady = Q.defer();
var game = new EventEmitter();

game.world = {};
game.byAccount = {};

function getEndpoints() {
    return Q.fcall(function() {
        if (endpointCache !== undefined) {
            return endpointCache;
        } else {
            return qhttp.read({
                url: process.env.SPODB_URL + '/endpoints',
                headers: {
                    "Content-Type": "application/json",
                }
            }).then(function(b) {
                endpointCache = JSON.parse(b.toString());
                return endpointCache;
            }).fail(function(e) {
                console.log("failed to fetch the endpoints");
                throw e;
            });
        }
    });
}

function getAuthToken() {
    return getEndpoints().then(function(endpoints) {
        var now = new Date().getTime();

        if (clientAuth !== undefined && clientAuth.expires > now) {
            return clientAuth.token;
        } else {
            return qhttp.read({
                url: endpoints.auth + '/auth?ttl=3600',
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": 'Basic ' + new Buffer(process.env.INTERNAL_CREDS).toString('base64')
                }
            }).then(function(b) {
                clientAuth = JSON.parse(b.toString());
                return clientAuth.token;
            }).fail(function(e) {
                console.log("failed to get auth token");
                throw e;
            });
        }
    });
}

getAuthToken().then(function(token) {
    console.log("authenticated, connecting");

    var protocol, url = urlUtil.parse(process.env.SPODB_URL);
    if (url.protocol == 'https:') {
        protocol = 'wss';
    } else {
        protocol = 'ws';
    }
    ws = new WebSocket(protocol+'://'+url.host+'/', {
        headers: {
            "Authorization": 'Bearer ' + token
        
        }
    });
}).then(function() {
    ws.on('error', function(error) {
        console.log("error: %s", error);
    });

    ws.on('close', function() {
        console.log("lost connection to the game");
        process.exit(1);
    });

    ws.on('message', handleMessage);
}).done();


//"Authorization": "Bearer " + token,


function handleMessage(message) {
    var data;

    try {
        data = JSON.parse(message);
    } catch(e) {
        console.log("invalid json: %s", message);
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
            game.world[data.state.key] = deepMerge(data.state.values, game.world[data.state.key]);

            if (game.world[data.state.key].tombstone === true) {
                var data_account = game.world[data.state.key].account;

                if (data_account !== undefined && game.byAccount[data_account] !== undefined) {
                    var i = game.byAccount[data_account].indexOf(data.state.key);

                    if (i > -1) {
                        game.byAccount[data_account].splice(i, 1);
                    }
                } else {
                    console.log("unable to remove from account list "+data.state.key);
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
    var accountList = [ clientAuth.account, "the-other-guy" ];
    var byAccount = game.byAccount;

    // TODO The accountList may not be up to date right away
    accountList.forEach(function(account) {
        if (byAccount[account] === undefined || byAccount[account].length === 0) {
            cmd('spawn', { account: account });
            cmd('spawn', { account: account });
        } else if (byAccount[account].length < 2) {
            cmd('spawn', { account: account });
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
                    accounts.forEach(function (enemy) {
                        if (!done && uuid != enemy && game.byAccount[enemy].length > 0) {
                            cmd('orbit', { subject: key, target: game.byAccount[enemy][0] });
                            cmd('shoot', { subject: key, target: game.byAccount[enemy][0] });
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

    setInterval(autoSpawn, 1000);
    setInterval(autoTargetEnemy, 1000);
});
