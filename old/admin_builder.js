'use strict';

var WebSocket = require('ws');

var urlUtil = require("url");
var Q = require('q');
var qhttp = require("q-io/http");
var deepMerge = require('./deepMerge');
var EventEmitter = require('events').EventEmitter;
var machina = require('machina');
var C = require('spacebox-common');
var uuidGen = require('node-uuid');

Q.longStackSupport = true;

var clientAuth;
var endpointCache;
var game = {
    world: {},
    byAccount: {}
};

var websocketFSM = machina.Fsm.extend({
    initialState: 'uninitialized',
    eventListeners: {
        nohandler: [ function(o) { console.log('nohandler', this.service_name, o); } ],
        handling: [ function(o) { console.log('handling', this.service_name, o); } ],
    },
    open: function() {
        openWebSocket(this.service_name, this).then(function(ws) {
            this.ws = ws;
        }.bind(this));
    },
    states: {
        'uninitialized': {
            _onEnter: function() {
                this.open();
            },
            'socket_connected': 'connected',
        },
        'connected': {
            'json_message': function(msg) {
                this.emit('message', msg);
            },
            'socket_error': function(e) { console.log("error: %s", e); },
            'socket_message': function(m) { 
                var data;

                try {
                    data = JSON.parse(m);
                } catch (e) {
                    console.log("invalid json: %s", m);
                    return;
                }

                this.handle('json_message', data);
            },
            'socket_closed': 'disconnected'
        },
        'disconnected': {
            _onEnter: function() {
                this.open();
            }
        }
    }
});

var spaceWebsocketsFSM = new websocketFSM({
    service_name: '3dsim',
    states: {
        'disconnected': {
            _onEnter: function() {
                // TODO we could reconnect, but I don't want to atm
                console.log("lost connection to the game");
                process.exit(1);
            }
        }
    }
});


var buildFSM = new websocketFSM({
    service_name: 'build',
});

var gameAgentFSM = new machina.Fsm({
    initialState: 'uninitialized',
    initialize: function() {
        buildFSM.on('message', function(m) {
            this.handle('industry update', m);
        }.bind(this));
        spaceWebsocketsFSM.on('message', function(m) {
            if (m.type == 'state') {
                this.handle('space update', m.state);
            }
        }.bind(this));
    },
    eventListeners: {
        nohandler: [ function(o) { console.log('nohandler', o); } ],
        handling: [ function(o) { console.log('handling', o); } ],
        transition: [ function(o) { console.log('transition', o); } ],
    },
    states: {
        'uninitialized': {
            'connected': function() {
                var uuid = uuidGen.v1();
                C.request('inventory', 'POST', 204, '/inventory', [{
                    container_action: 'create',
                    uuid: uuid,
                    blueprint: "d9c166f0-3c6d-11e4-801e-d5aa4697630f" // factory
                }, {
                    inventory: uuid,
                    slice: 'default',
                    blueprint: "7abb04d3-7d58-42d8-be93-89eb486a1c67", // startership
                    quantity: 2
                }]).then(function() {
                    return C.request('inventory', 'POST', 200, '/ships', {
                        inventory: uuid,
                        slice: 'default',
                        blueprint: "7abb04d3-7d58-42d8-be93-89eb486a1c67",
                    });
                }).then(function(s) {
                    console.log(s);
                    cmd('undock', { ship_uuid: s.uuid });
                }).done();
            }
        },
    }
});

setInterval(function() {
    console.log("agent state: %s", gameAgentFSM.state);
}, 1000);


function openWebSocket(which, fsm) {
    if (fsm === undefined) {
        throw new Error("fsm must not be undefined");
    }

    return Q.spread([C.getEndpoints(), C.getAuth()], function(endpoints, auth) {
        console.log("authenticated, connecting to "+which);

        clientAuth = auth;
        var token = auth.token;

        var protocol, url = urlUtil.parse(endpoints[which]);
        if (url.protocol == 'https:') {
            protocol = 'wss';
        } else {
            protocol = 'ws';
        }

        var ws = new WebSocket(protocol + '://' + url.host + '/', {
            headers: {
                "Authorization": 'Bearer ' + token
            }
        });

        ws.on('open', function() {
            console.log("connected to "+which);
            fsm.handle('socket_connected');
        });

        ws.on('error', function(error) {
            fsm.handle('socket_error', error);
        });

        ws.on('close', function() {
            fsm.handle('socket_closed');
        });

        ws.on('message', function(msg) {
            fsm.handle('socket_message', msg);
        });

        return ws;
    });
}

spaceWebsocketsFSM.on('message', function(data) {
    switch (data.type) {
        case "arenaAccount":
            clientAuth = data.account;
        break;
        case "connectionReady":
            gameAgentFSM.handle('connected');
        break;
        case "state":
            game.world[data.state.key] = deepMerge(data.state.values, game.world[data.state.key]);

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

        break;
    }

});

function cmd(name, opts) {
    if (opts === undefined) {
        opts = {};
    }

    opts.command = name;
    console.log(opts);

    spaceWebsocketsFSM.ws.send(JSON.stringify(opts));
}
