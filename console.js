#!/usr/bin/env node

'use strict';

var repl = require("repl"),
    r = repl.start({})

require('./src/helpers')(r.context)
require('./src/common_setup')(r.context)

r.on('exit', function () {
    console.log("closing")
    r.context.closeWebSocket()
    process.exit()
})

