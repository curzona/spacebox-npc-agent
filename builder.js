'use strict';

var WebSocket = require('ws');

var urlUtil = require("url");
var Q = require('q');
var qhttp = require("q-io/http");
var deepMerge = require('./deepMerge');
var EventEmitter = require('events').EventEmitter;
var machina = require('machina');
var C = require('spacebox-common');

Q.longStackSupport = true;

var clientAuth;
var endpointCache;
var game = {
    world: {},
    byAccount: {}
};

var buildRequestFSM = new machina.Fsm({
    initialState: 'uninitialized',
    initialize: function() {

    }
});

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
    service_name: 'space',
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
            // TODO I don't actually know that I have nothing
            'connected': 'have nothing',
        },
        'have nothing': {
            _onEnter: function() {
                cmd('spawnStarter');
            },
            'industry update': function(msg) {
                if (msg.type == 'facility' && msg.blueprint == '7abb04d3-7d58-42d8-be93-89eb486a1c67' && msg.tombstone !== true) {
                    this.starterShip = msg.uuid;
                    this.handle('loadout complete');
                }
            },
            'loadout complete': 'have starter'
        },
        'have starter': {
            _onEnter: function() {
                this.handle('build a scaffold');
            },
            'build a scaffold': function() {
                build('manufacture', 'ffb74468-7162-4bfb-8a0e-a8ae72ef2a8b',
                      this.starterShip, 1).then(function(body) {
                    this.job_uuid = body.job.uuid;
                }.bind(this)).done();
            },
            'industry update': function(msg) {
                if (msg.type == 'job' && msg.uuid == this.job_uuid && msg.state == 'delivered') {
                    this.handle('scaffold complete');
                }
            },
            'scaffold complete': 'have a scaffold'
        },
        'have a scaffold': {
            _onEnter: function() {
                cmd('deploy', {
                    shipID: this.starterShip,
                    slice: 'default',
                    blueprint: 'ffb74468-7162-4bfb-8a0e-a8ae72ef2a8b'
                });
            },
            'industry update': function(msg) {
                if (msg.type == 'facility' && msg.blueprint == 'ffb74468-7162-4bfb-8a0e-a8ae72ef2a8b' && msg.tombstone !== true) {
                    this.scaffold = msg.uuid;
                    this.handle('deploy complete');
                }
            },
            'deploy complete': 'scaffold deployed',
        },
        'scaffold deployed': {
            _onEnter: function() {
                var self = this;
                C.request('inventory', 'POST', 204, '/inventory', [
                    {
                        inventory: this.starterShip,
                        slice: 'default',
                        blueprint: "f9e7e6b4-d5dc-4136-a445-d3adffc23bc6", // metal
                        quantity: 2
                    },
                    {
                        inventory: this.scaffold,
                        slice: 'default',
                        blueprint: "f9e7e6b4-d5dc-4136-a445-d3adffc23bc6", // metal
                        quantity: 2
                    },
                ]).then(function() {
                    return build('construct', "33e24278-4d46-4146-946e-58a449d5afae",
                          self.scaffold, 1).then(function(body) {
                        self.job_uuid = body.job.uuid;
                    });
                }).done();
            },
            'industry update': function(msg) {
                if (msg.type == 'facility' && msg.blueprint == "33e24278-4d46-4146-946e-58a449d5afae" && msg.tombstone !== true) {
                    this.handle('job complete');
                }
            },
            'job complete': 'have a mine',
        },
        'have a mine': {

        }
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

function build(how, what, where, how_many) {
    return C.request('build', 'POST', 201, '/jobs', {
        target: what,
        facility: where,
        action: how,
        quantity: how_many,
        slice: 'default'
    });
}
