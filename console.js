#!/usr/bin/env node

'use strict';

process.env.STDOUT_LOG_LEVEL='error'

var repl = require("repl")
var r = repl.start({})

require('./src/helpers')(r.context)

var C = require('spacebox-common')

C.deepMerge({
    C: C,
    async: require('async-q'),
    inventory: function() {
        r.context.client.get('/inventory').then(function(data) {
            console.log(data.reduce(function(acc, row) {
                acc[row.id] = row.doc.contents['default']
                return acc
            }, {}))
        })
    }
}, r.context)

r.on('exit', function () {
    console.log("closing")
    r.context.closeWebSocket()
    process.exit()
})

