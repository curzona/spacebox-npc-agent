
#!/usr/bin/env node

'use strict';

var Q = require('q'),
    C = require('spacebox-common')

var ctx = {}
require('../src/helpers')(ctx)

ctx.whenConnected.then(function() {
    return ctx.cmd('resetAccount').delay(1000)
}).then(function() {
    console.log('Done, you may Cntl-C at any time unless you are waiting')
}).fail(function(e) {
    if (e !== undefined && e.stacktrace !== undefined) {
        console.log(e.stacktrace)
    } else {
        console.log(e)
    }

    process.exit()
}).done()
