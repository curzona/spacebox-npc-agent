'use strict';

var WebSocket = require('ws');

var urlUtil = require("url");
var Q = require('q');
var qhttp = require("q-io/http");
var deepMerge = require('./deepMerge');
var EventEmitter = require('events').EventEmitter;
var machina = require('machina');

Q.longStackSupport = true;

var clientAuth;
var endpointCache;
var game = {
    world: {},
    byAccount: {}
};

var gameAgentFSM = new machina.Fsm({
    initialState: 'uninitialized',
    eventListeners: {
        nohandler: [ function(o) { console.log(o); } ],
        handling: [ function(o) { console.log(o); } ],
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
                } else {
                    console.log('these are not the droids you are looking for');
                
                }
            },
            'loadout complete': 'have starter'
        },
        'have starter': {
            _onEnter: function() {
                this.handle('build a scaffold');
            },
            'build a scaffold': function() {
                var self = this;
                request('build', 'GET', 200, '/facilities?all=true').then(function(list) {
                    console.log(list);
                    return build('manufacture', 'ffb74468-7162-4bfb-8a0e-a8ae72ef2a8b', self.starterShip, 1);
                }).then(function(body) {
                    self.job_uuid = body.job.uuid;
                }).done();
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
            }
        }
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
            'json_message': function(m) { console.log(this.service_name, 'default', m); },
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
        'connected': {
            'ready': function() {
                gameAgentFSM.handle('connected');
            },
            'update': function(state) {
                console.log(state.values);
                gameAgentFSM.handle('space update', state);

            },
            'json_message': handleMessage,
        },
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
    states: {
        'connected': {
            'json_message': function(msg) {
                gameAgentFSM.handle('industry update', msg);
            }
        }
    }
});

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

function openWebSocket(which, fsm) {
    if (fsm === undefined) {
        throw new Error("fsm must not be undefined");
    }

    return Q.spread([getEndpoints(), getAuthToken()], function(endpoints, token) {
        console.log("authenticated, connecting to "+which);

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

function handleMessage(data) {
    switch (data.type) {
        case "arenaAccount":
            clientAuth = data.account;
            break;
        case "connectionReady":
            spaceWebsocketsFSM.handle('ready');
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

            spaceWebsocketsFSM.handle('update', data.state);
            break;
    }

}

function cmd(name, opts) {
    if (opts === undefined) {
        opts = {};
    }

    opts.command = name;
    console.log(opts);

    spaceWebsocketsFSM.ws.send(JSON.stringify(opts));
}

function build(how, what, where, how_many) {
    return request('build', 'POST', 201, '/jobs', {
        target: what,
        facility: where,
        action: how,
        quantity: how_many,
        slice: 'default'
    });
}

function request(endpoint, method, expects, path, body) {
    return Q.spread([getEndpoints(), getAuthToken()], function(endpoints, token) {
        return qhttp.request({
            method: method,
            url: endpoints[endpoint] + path,
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            },
            body: ( body === undefined ? [] : [JSON.stringify(body)])
        }).then(function(resp) {
            if (resp.status !== expects) {
                resp.body.read().then(function(b) {
                    console.log("build " + resp.status + " reason: " + b.toString());
                }).done();

                throw new Error(endpoint+" responded with " + resp.status);
            } else {
                return resp.body.read().then(function(b) {
                    try {
                        return JSON.parse(b.toString());
                    } catch(e) {
                        console.log(e);
                        return b;
                    }
                });
            }
        });
    });
}
