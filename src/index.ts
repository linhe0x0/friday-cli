#!/usr/bin/env node

import yargs from 'yargs'

import build from './bin/build'
import dev from './bin/dev'
import start from './bin/start'

// eslint-disable-next-line no-unused-expressions
yargs
  .scriptName('friday')
  .usage('$0 <cmd> [args]')
  .command(
    ['start', '$0'],
    'start a server, as it is the default command',
    {
      host: {
        alias: 'h',
        describe: 'specify a host on which to listen',
        type: 'string',
      },
      port: {
        alias: 'p',
        describe: 'specify a port on which to listen',
        type: 'number',
      },
      listen: {
        alias: 'l',
        describe: 'specify a URI endpoint on which to listen',
        type: 'string',
      },
      'unix-socket': {
        alias: 'n',
        describe: 'path to a UNIX socket',
        type: 'string',
      },
    },
    start
  )
  .command(
    'dev',
    'start a server in development',
    {
      host: {
        alias: 'h',
        describe: 'specify a host on which to listen',
        type: 'string',
      },
      port: {
        alias: 'p',
        describe: 'specify a port on which to listen',
        type: 'number',
      },
      listen: {
        alias: 'l',
        describe: 'specify a URI endpoint on which to listen',
        type: 'string',
      },
      'unix-socket': {
        alias: 'n',
        describe: 'path to a UNIX socket',
        type: 'string',
      },
    },
    dev
  )
  .command(
    'build',
    'build typescript code to js',
    {
      clean: {
        alias: 'c',
        describe: 'delete the outputs of all projects',
        type: 'boolean',
      },
      watch: {
        alias: 'w',
        describe: 'watch input files',
        type: 'boolean',
      },
      dist: {
        alias: 'd',
        describe: 'Specify an output folder for all emitted files',
        type: 'string',
      },
    },
    build
  )
  .help()
  .example(
    '',
    `
  For TCP (traditional host/port) endpoint:

    $ friday -p 1234
    $ friday -l tcp://hostname:1234

  For UNIX domain socket endpoint:

    $ friday -l unix:/path/to/socket.sock

  For development with belt full of tools:

    $ friday dev
`
  ).argv
